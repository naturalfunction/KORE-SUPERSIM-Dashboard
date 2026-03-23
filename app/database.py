"""Database initialization and session management."""
from datetime import datetime, timedelta
from sqlalchemy import create_engine, func, text
from sqlalchemy.orm import sessionmaker
from contextlib import contextmanager
import logging
import time

from .models import Base, ConnectionEvent
from config import DATABASE_URL, DATA_RETENTION_DAYS

logger = logging.getLogger(__name__)

# Create engine with connection pooling
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},  # Needed for SQLite
    pool_pre_ping=True,  # Verify connections before using
    echo=False  # Set to True for SQL query logging
)

# Create session factory
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    expire_on_commit=False,
)

def init_db():
    """Initialize database tables."""
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables created successfully")
    except Exception as e:
        logger.error(f"Error creating database tables: {e}")
        raise


@contextmanager
def get_db():
    """Provide a transactional scope for database operations."""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Database error: {e}")
        raise
    finally:
        db.close()


def cleanup_old_events():
    """Delete events older than DATA_RETENTION_DAYS.
    
    Returns:
        int: Number of events deleted
    """
    cutoff_date = datetime.utcnow() - timedelta(days=DATA_RETENTION_DAYS)
    
    try:
        with get_db() as db:
            # Count events to be deleted
            count = db.query(ConnectionEvent).filter(
                ConnectionEvent.event_time < cutoff_date
            ).count()
            
            if count > 0:
                # Delete old events
                db.query(ConnectionEvent).filter(
                    ConnectionEvent.event_time < cutoff_date
                ).delete()
                
                logger.info(
                    f"Cleanup completed: Deleted {count} events older than "
                    f"{DATA_RETENTION_DAYS} days (before {cutoff_date.isoformat()})"
                )
            else:
                logger.info("Cleanup completed: No old events to delete")
            
            return count
    except Exception as e:
        logger.error(f"Error during cleanup: {e}")
        raise


def get_database_stats():
    """Get database statistics.
    
    Returns:
        dict: Database statistics including total events, oldest/newest event times,
              unique SIMs, data usage, events by type, top networks, and countries
    """
    try:
        with get_db() as db:
            total_events = db.query(func.count(ConnectionEvent.id)).scalar() or 0
            
            if total_events > 0:
                oldest_event = db.query(func.min(ConnectionEvent.event_time)).scalar()
                newest_event = db.query(func.max(ConnectionEvent.event_time)).scalar()
            else:
                oldest_event = None
                newest_event = None
            
            # Unique SIMs
            unique_sims = db.query(func.count(func.distinct(ConnectionEvent.sim_iccid))).scalar() or 0
            
            # Total data usage (treat null data_total as 0)
            total_data_usage = db.query(func.coalesce(func.sum(ConnectionEvent.data_total), 0)).scalar()
            
            # Events by type
            type_rows = db.query(
                ConnectionEvent.event_type,
                func.count(ConnectionEvent.id)
            ).group_by(ConnectionEvent.event_type).all()
            events_by_type = [{'type': row[0], 'count': row[1]} for row in type_rows]
            
            # Top networks
            network_rows = db.query(
                ConnectionEvent.network_name,
                ConnectionEvent.network_iso_country,
                func.count(ConnectionEvent.id)
            ).group_by(
                ConnectionEvent.network_name,
                ConnectionEvent.network_iso_country
            ).order_by(func.count(ConnectionEvent.id).desc()).all()
            top_networks = [{'name': row[0], 'country': row[1], 'count': row[2]} for row in network_rows]
            
            # Countries
            country_rows = db.query(
                ConnectionEvent.network_iso_country,
                func.count(ConnectionEvent.id)
            ).group_by(
                ConnectionEvent.network_iso_country
            ).order_by(func.count(ConnectionEvent.id).desc()).all()
            countries = [{'country': row[0], 'count': row[1]} for row in country_rows]
            
            # RAT type distribution
            rat_rows = db.query(
                ConnectionEvent.rat_type,
                func.count(ConnectionEvent.id)
            ).group_by(ConnectionEvent.rat_type).order_by(func.count(ConnectionEvent.id).desc()).all()
            rat_types = [{'type': row[0] or 'Unknown', 'count': row[1]} for row in rat_rows]
            
            # Top devices by event count
            device_rows = db.query(
                func.coalesce(ConnectionEvent.sim_unique_name, ConnectionEvent.sim_iccid),
                func.count(ConnectionEvent.id)
            ).group_by(func.coalesce(ConnectionEvent.sim_unique_name, ConnectionEvent.sim_iccid)).order_by(func.count(ConnectionEvent.id).desc()).limit(10).all()
            top_devices = [{'name': row[0] or 'Unknown', 'count': row[1]} for row in device_rows]
            
            # Data usage per device
            data_device_rows = db.query(
                func.coalesce(ConnectionEvent.sim_unique_name, ConnectionEvent.sim_iccid),
                func.coalesce(func.sum(ConnectionEvent.data_total), 0)
            ).group_by(func.coalesce(ConnectionEvent.sim_unique_name, ConnectionEvent.sim_iccid)).order_by(func.sum(ConnectionEvent.data_total).desc()).limit(10).all()
            data_per_device = [{'name': row[0] or 'Unknown', 'bytes': row[1]} for row in data_device_rows]
            
            # Daily event timeline (last 30 days)
            cutoff = datetime.utcnow() - timedelta(days=30)
            timeline_rows = db.query(
                func.date(ConnectionEvent.event_time),
                func.count(ConnectionEvent.id)
            ).filter(
                ConnectionEvent.event_time >= cutoff
            ).group_by(func.date(ConnectionEvent.event_time)).order_by(func.date(ConnectionEvent.event_time)).all()
            daily_timeline = [{'date': str(row[0]), 'count': row[1]} for row in timeline_rows]
            
            return {
                'total_events': total_events,
                'oldest_event': oldest_event.isoformat() if oldest_event else None,
                'newest_event': newest_event.isoformat() if newest_event else None,
                'unique_sims': unique_sims,
                'total_data_usage': total_data_usage,
                'events_by_type': events_by_type,
                'top_networks': top_networks,
                'countries': countries,
                'rat_types': rat_types,
                'top_devices': top_devices,
                'data_per_device': data_per_device,
                'daily_timeline': daily_timeline,
            }
    except Exception as e:
        logger.error(f"Error getting database stats: {e}")
        return {
            'total_events': 0,
            'oldest_event': None,
            'newest_event': None,
            'unique_sims': 0,
            'total_data_usage': 0,
            'events_by_type': [],
            'top_networks': [],
            'countries': [],
            'rat_types': [],
            'top_devices': [],
            'data_per_device': [],
            'daily_timeline': [],
            'error': str(e)
        }


def get_database_health():
    """Check database connectivity and latency."""
    start = time.perf_counter()
    try:
        with get_db() as db:
            db.execute(text("SELECT 1"))
        latency_ms = int((time.perf_counter() - start) * 1000)
        return {"ok": True, "latency_ms": latency_ms}
    except Exception as e:
        latency_ms = int((time.perf_counter() - start) * 1000)
        return {"ok": False, "latency_ms": latency_ms, "error": str(e)}
