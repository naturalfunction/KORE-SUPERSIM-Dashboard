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
        dict: Database statistics including total events, oldest/newest event times
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
            
            return {
                'total_events': total_events,
                'oldest_event': oldest_event.isoformat() if oldest_event else None,
                'newest_event': newest_event.isoformat() if newest_event else None,
            }
    except Exception as e:
        logger.error(f"Error getting database stats: {e}")
        return {
            'total_events': 0,
            'oldest_event': None,
            'newest_event': None,
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
