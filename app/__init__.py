from flask import Flask
from werkzeug.middleware.proxy_fix import ProxyFix
from apscheduler.schedulers.background import BackgroundScheduler
import logging
import os
import atexit

from .database import init_db, cleanup_old_events
from config import CLEANUP_HOUR, CLEANUP_MINUTE, MAX_CONTENT_LENGTH

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def create_app():
    # Initialize Flask app
    # Use absolute paths for templates and static to ensure they are found
    base_dir = os.path.dirname(os.path.abspath(__file__))
    templates_dir = os.path.join(base_dir, 'templates')
    static_dir = os.path.join(base_dir, 'static')
    
    app = Flask(__name__, template_folder=templates_dir, static_folder=static_dir)
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_port=1, x_prefix=1)
    app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_LENGTH

    # Initialize database
    init_db()
    logger.info("Database initialized successfully")

    # Initialize scheduler for cleanup jobs
    scheduler = BackgroundScheduler()
    scheduler.add_job(
        func=cleanup_old_events,
        trigger='cron',
        hour=CLEANUP_HOUR,
        minute=CLEANUP_MINUTE,
        id='cleanup_old_events',
        name='Cleanup old events',
        replace_existing=True
    )
    scheduler.start()
    logger.info(f"Scheduler started - cleanup job will run daily at {CLEANUP_HOUR:02d}:{CLEANUP_MINUTE:02d}")
    
    # Register shutdown handler
    atexit.register(lambda: scheduler.shutdown())

    # Register blueprints/routes
    from .routes import main_bp
    app.register_blueprint(main_bp)

    return app
