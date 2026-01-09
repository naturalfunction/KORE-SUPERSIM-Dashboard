"""Configuration settings for KORE SUPER SIM Event Stream Dashboard."""
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Base directory
BASE_DIR = Path(__file__).resolve().parent

# Database configuration
DATABASE_PATH = os.getenv("DATABASE_PATH", str(BASE_DIR / "supersim_events.db"))
DATABASE_URL = f"sqlite:///{DATABASE_PATH}"

# Data retention (in days)
DATA_RETENTION_DAYS = int(os.getenv("DATA_RETENTION_DAYS", 120))  # 4 months

# Server configuration
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", 6001))
DEBUG = os.getenv("DEBUG", "False").lower() == "true"

# Dashboard configuration
AUTO_REFRESH_INTERVAL = int(os.getenv("AUTO_REFRESH_INTERVAL", 15))  # seconds
EVENTS_PER_PAGE = int(os.getenv("EVENTS_PER_PAGE", 50))
MAX_EVENTS_LIMIT = int(os.getenv("MAX_EVENTS_LIMIT", 1000))

# Request limits and webhook rate limiting
MAX_CONTENT_LENGTH = int(os.getenv("MAX_CONTENT_LENGTH", 2 * 1024 * 1024))  # bytes
WEBHOOK_RATE_LIMIT = int(os.getenv("WEBHOOK_RATE_LIMIT", 60))  # requests
WEBHOOK_RATE_WINDOW = int(os.getenv("WEBHOOK_RATE_WINDOW", 60))  # seconds

# Cleanup job schedule (cron format: hour, minute)
CLEANUP_HOUR = int(os.getenv("CLEANUP_HOUR", 2))  # 2 AM
CLEANUP_MINUTE = int(os.getenv("CLEANUP_MINUTE", 0))

# Branding
APP_TITLE = "KORE SUPER SIM Dashboard"
COMPANY_NAME = "KORE Wireless"

# Security (Configure these in .env)
KORE_WEBHOOK_SECRET = os.getenv("KORE_WEBHOOK_SECRET")
# Optional: explicit callback URL KORE uses for signing (query/fragment are ignored)
KORE_WEBHOOK_CALLBACK_URL = os.getenv("KORE_WEBHOOK_CALLBACK_URL")
