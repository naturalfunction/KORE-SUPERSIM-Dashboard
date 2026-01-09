from app import create_app
import logging
from config import HOST, PORT, DEBUG, APP_TITLE, AUTO_REFRESH_INTERVAL

logger = logging.getLogger(__name__)

app = create_app()

if __name__ == '__main__':
    logger.info(f"Starting {APP_TITLE}")
    logger.info(f"Dashboard will be available at http://{HOST}:{PORT}")
    logger.info(f"Webhook endpoint: http://{HOST}:{PORT}/webhook/super")
    logger.info(f"Auto-refresh interval: {AUTO_REFRESH_INTERVAL} seconds")
    
    app.run(host=HOST, port=PORT, debug=DEBUG)
