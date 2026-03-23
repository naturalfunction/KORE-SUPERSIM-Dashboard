from flask import Blueprint, request, jsonify, render_template
from datetime import datetime
from sqlalchemy.exc import IntegrityError
from sqlalchemy import desc, func
import logging
import hmac
import hashlib
import time
import threading
import os
import json

from .models import ConnectionEvent
from .database import get_db, get_database_stats, get_database_health
from config import (
    APP_TITLE, COMPANY_NAME, AUTO_REFRESH_INTERVAL,
    EVENTS_PER_PAGE, MAX_EVENTS_LIMIT,
    WEBHOOK_RATE_LIMIT, WEBHOOK_RATE_WINDOW
)

logger = logging.getLogger(__name__)

main_bp = Blueprint("main", __name__)

_rate_lock = threading.Lock()
_rate_buckets = {}
_last_bucket_cleanup = 0.0


# ─────────────────────────────────────────────────────────────
# Webhook helpers
# ─────────────────────────────────────────────────────────────

def _rate_limited(ip_addr: str):
    global _last_bucket_cleanup

    if WEBHOOK_RATE_LIMIT <= 0:
        return False

    now = time.monotonic()
    window_start = now - WEBHOOK_RATE_WINDOW

    with _rate_lock:
        # Periodically sweep all buckets to remove stale IPs (every 10x the window)
        if now - _last_bucket_cleanup > WEBHOOK_RATE_WINDOW * 10:
            stale = [ip for ip, ts_list in _rate_buckets.items()
                     if not any(t >= window_start for t in ts_list)]
            for ip in stale:
                del _rate_buckets[ip]
            _last_bucket_cleanup = now

        bucket = _rate_buckets.get(ip_addr, [])
        bucket = [ts for ts in bucket if ts >= window_start]

        if len(bucket) >= WEBHOOK_RATE_LIMIT:
            _rate_buckets[ip_addr] = bucket
            return True

        bucket.append(now)
        _rate_buckets[ip_addr] = bucket

    return False


def _verify_webhook_signature(raw_body: bytes) -> bool:
    """
    Verify KORE webhook signature.

    Algorithm:
        SHA256( SECRET + METHOD + CALLBACK_URL + MINIFIED_JSON_BODY )

    IMPORTANT:
    - KORE parses the JSON and re-serializes it with minified formatting
    - CALLBACK_URL must match KORE portal config exactly
    """

    secret = os.getenv("KORE_WEBHOOK_SECRET")
    callback_url = os.getenv("KORE_WEBHOOK_CALLBACK_URL")

    if not secret:
        logger.error("KORE_WEBHOOK_SECRET is not set; refusing webhook")
        return False

    if not callback_url:
        logger.error("KORE_WEBHOOK_CALLBACK_URL is not set; refusing webhook")
        return False

    provided = request.headers.get("kore-signature")
    if not provided:
        logger.warning("Missing kore-signature header")
        return False

    method = request.method.upper()

    # KORE parses JSON and re-serializes with minified formatting
    try:
        json_data = json.loads(raw_body.decode('utf-8'))
        minified_json = json.dumps(json_data, separators=(',', ':'))
    except Exception as e:
        logger.error("Failed to parse webhook body as JSON: %s", e)
        return False

    payload = (
        secret.encode("utf-8")
        + method.encode("utf-8")
        + callback_url.encode("utf-8")
        + minified_json.encode("utf-8")
    )

    calculated = hashlib.sha256(payload).hexdigest()
    provided = provided.strip().lower()

    valid = hmac.compare_digest(calculated, provided)

    if not valid:
        logger.warning(
            "Webhook signature mismatch (method=%s, callback_url=%s, host=%s, body_len=%s, remote_addr=%s)",
            method,
            callback_url,
            request.host,
            len(raw_body),
            request.remote_addr,
        )

    return valid


def _is_idempotent_retry(db, token):
    if not token:
        return False
    return (
        db.query(ConnectionEvent)
        .filter(ConnectionEvent.idempotency_token == token)
        .first()
        is not None
    )


def _validate_event_payload(event):
    if not isinstance(event, dict):
        return "Event must be an object"

    data = event.get("data")
    if not isinstance(data, dict):
        return "Event.data must be an object"

    if not (data.get("event_sid") or event.get("id")):
        return "Missing event id"

    if not (data.get("event_type") or event.get("type")):
        return "Missing event type"

    if not (data.get("timestamp") or event.get("time")):
        return "Missing event timestamp"

    if not data.get("sim_iccid"):
        return "Missing sim_iccid"

    try:
        datetime.fromisoformat(
            str(data.get("timestamp") or event.get("time")).replace("Z", "+00:00")
        )
    except Exception:
        return "Invalid timestamp format"

    return None


# ─────────────────────────────────────────────────────────────
# Webhook endpoint
# ─────────────────────────────────────────────────────────────

@main_bp.route("/webhook/super", methods=["POST"])
def webhook_super():
    try:
        ip = request.remote_addr or "unknown"

        if _rate_limited(ip):
            return jsonify({"status": "error", "message": "Rate limit exceeded"}), 429

        raw_body = request.get_data(cache=False)

        if not raw_body:
            return jsonify({"status": "error", "message": "Empty body"}), 400

        if not _verify_webhook_signature(raw_body):
            return jsonify({"status": "error", "message": "Unauthorized"}), 401

        try:
            events = json.loads(raw_body.decode("utf-8"))
        except Exception:
            return jsonify({"status": "error", "message": "Invalid JSON"}), 400

        if not isinstance(events, list):
            events = [events]

        for e in events:
            err = _validate_event_payload(e)
            if err:
                return jsonify({"status": "error", "message": err}), 400

        idempotency_token = request.headers.get("kore-idempotency-token")

        stored = 0

        with get_db() as db:
            if idempotency_token and _is_idempotent_retry(db, idempotency_token):
                logger.info("Duplicate webhook ignored (token=%s)", idempotency_token)
                return jsonify(
                    {"status": "success", "stored": 0, "message": "Already processed"}
                ), 200

            for event in events:
                data = event.get("data", {})
                location = data.get("location", {}) or {}
                network = data.get("network", {}) or {}

                ce = ConnectionEvent(
                    event_sid=data.get("event_sid") or event.get("id"),
                    event_type=data.get("event_type") or event.get("type"),
                    event_time=datetime.fromisoformat(
                        str(data.get("timestamp") or event.get("time")).replace("Z", "+00:00")
                    ),
                    sim_iccid=data.get("sim_iccid"),
                    sim_unique_name=data.get("sim_unique_name"),
                    sim_sid=data.get("sim_sid"),
                    fleet_sid=data.get("fleet_sid"),
                    imei=data.get("imei"),
                    imsi=data.get("imsi"),
                    apn=data.get("apn"),
                    network_mcc=network.get("mcc"),
                    network_mnc=network.get("mnc"),
                    network_name=network.get("friendly_name"),
                    network_iso_country=network.get("iso_country"),
                    rat_type=data.get("rat_type"),
                    latitude=location.get("lat"),
                    longitude=location.get("lon"),
                    lac=location.get("lac"),
                    cell_id=location.get("cell_id"),
                    data_total=data.get("data_total"),
                    data_upload=data.get("data_upload"),
                    data_download=data.get("data_download"),
                    ip_address=data.get("ip_address"),
                    account_sid=data.get("account_sid"),
                    idempotency_token=idempotency_token,
                    payload=event,
                    webhook_received_at=datetime.utcnow(),
                    remote_addr=ip,
                )

                db.add(ce)
                stored += 1

            try:
                db.commit()
                logger.info("Stored %s events from %s", stored, ip)
            except IntegrityError:
                db.rollback()
                return jsonify({"status": "error", "message": "Duplicate event"}), 400

        return jsonify({"status": "success", "stored": stored}), 200

    except Exception:
        logger.exception("Unhandled webhook error")
        return jsonify({"status": "error", "message": "Internal Server Error"}), 500


# ─────────────────────────────────────────────────────────────
# API + UI endpoints (unchanged)
# ─────────────────────────────────────────────────────────────

@main_bp.route("/api/events")
def get_events():
    limit = min(request.args.get("limit", EVENTS_PER_PAGE, type=int) or EVENTS_PER_PAGE, MAX_EVENTS_LIMIT)
    offset = max(request.args.get("offset", 0, type=int) or 0, 0)

    iccid = request.args.get("iccid")
    event_type = request.args.get("event_type")
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")
    device_name = request.args.get("device_name")
    rat_type = request.args.get("rat_type")
    country = request.args.get("country")
    network = request.args.get("network")

    with get_db() as db:
        q = db.query(ConnectionEvent)

        if iccid:
            q = q.filter(ConnectionEvent.sim_iccid == iccid)
        if device_name:
            q = q.filter(
                (ConnectionEvent.sim_unique_name == device_name) |
                ((ConnectionEvent.sim_unique_name.is_(None)) & (ConnectionEvent.sim_iccid == device_name))
            )
        if rat_type:
            q = q.filter(ConnectionEvent.rat_type == rat_type)
        if country:
            q = q.filter(ConnectionEvent.network_iso_country == country)
        if network:
            q = q.filter(ConnectionEvent.network_name == network)
        if event_type:
            q = q.filter(ConnectionEvent.event_type.contains(event_type))
        if start_date:
            try:
                parsed_start = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
                if parsed_start.tzinfo is not None:
                    parsed_start = parsed_start.replace(tzinfo=None)
                q = q.filter(ConnectionEvent.event_time >= parsed_start)
            except (ValueError, AttributeError):
                pass
        if end_date:
            try:
                parsed_end = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
                if parsed_end.tzinfo is not None:
                    parsed_end = parsed_end.replace(tzinfo=None)
                q = q.filter(ConnectionEvent.event_time <= parsed_end)
            except (ValueError, AttributeError):
                pass

        total = q.count()
        events = q.order_by(desc(ConnectionEvent.event_time)).offset(offset).limit(limit).all()

    return jsonify(
        {
            "total": total,
            "limit": limit,
            "offset": offset,
            "events": [e.to_dict() for e in events],
        }
    )


@main_bp.route("/api/stats")
def stats():
    return jsonify(get_database_stats())


@main_bp.route("/api/devices")
def get_devices():
    with get_db() as db:
        rows = db.query(
            func.coalesce(ConnectionEvent.sim_unique_name, ConnectionEvent.sim_iccid)
        ).filter(
            (ConnectionEvent.sim_unique_name.isnot(None)) | (ConnectionEvent.sim_iccid.isnot(None))
        ).distinct().order_by(func.coalesce(ConnectionEvent.sim_unique_name, ConnectionEvent.sim_iccid)).all()
    return jsonify([r[0] for r in rows])


@main_bp.route("/api/heatmap")
def heatmap():
    with get_db() as db:
        # Subquery: most recent event per SIM (max id grouped by sim_iccid)
        subq = db.query(func.max(ConnectionEvent.id)).group_by(
            ConnectionEvent.sim_iccid
        ).scalar_subquery()

        # Get full events for those IDs, filtering out null coordinates
        events = db.query(ConnectionEvent).filter(
            ConnectionEvent.id.in_(subq),
            ConnectionEvent.latitude.isnot(None),
            ConnectionEvent.longitude.isnot(None),
        ).all()

    online = []
    offline = []

    for e in events:
        entry = {
            "lat": e.latitude,
            "lon": e.longitude,
            "iccid": e.sim_iccid,
            "timestamp": e.event_time.isoformat() if e.event_time else None,
        }

        if e.event_type and "ended" in e.event_type:
            entry["status"] = "offline"
            offline.append(entry)
        elif e.event_type and ("started" in e.event_type or "updated" in e.event_type):
            entry["status"] = "online"
            online.append(entry)

    return jsonify({"online": online, "offline": offline})


@main_bp.route("/health")
def health():
    return jsonify(
        {
            "status": "healthy",
            "database": get_database_stats(),
            "db_health": get_database_health(),
            "app_title": APP_TITLE,
        }
    )


@main_bp.route("/")
def dashboard():
    with get_db() as db:
        events = (
            db.query(ConnectionEvent)
            .order_by(desc(ConnectionEvent.event_time))
            .limit(100)
            .all()
        )

    db_stats = get_database_stats()

    return render_template(
        "dashboard.html",
        events=events,
        db_stats=db_stats,
        app_title=APP_TITLE,
        company_name=COMPANY_NAME,
        auto_refresh=AUTO_REFRESH_INTERVAL,
    )
