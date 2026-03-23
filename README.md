# KORE SUPER SIM Dashboard

A proof of concept webhook receiver and analytics dashboard for **KORE Wireless SUPER SIM** Event Streams. Built with Flask for real-time monitoring, persistent storage, and comprehensive analytics. 
-> THIS IS NOT A PRODUCTION READY CODEBASE, TESTING & EDUCATIONAL PURPOSES ONLY, PLEASE USE WITH CAUTION <-

## Features

✅ **Webhook Security** - KORE signature verification with proper JSON minification  
✅ **CloudEvents 1.0 Support** - Receives KORE SUPER SIM event streams  
✅ **SQLite Database** - Persistent storage with automatic data retention  
✅ **Real-time Dashboard** - Live event monitoring with auto-refresh (pauses on JSON view)  
✅ **Analytics & Charts** - Event timeline, RAT types, top devices, data usage per device, networks, countries, and event type breakdown  
✅ **Interactive Chart Drill-Down** - Click any chart segment to filter matching events in Search & Filter  
✅ **Search & Filter** - Find events by ICCID, device name, event type, date range, RAT type, country, and network  
✅ **Global Connectivity Map** - Heatmap with auto-fit zoom, online/offline device status, and fly-to navigation  
✅ **Expandable Event Details** - Structured and JSON views with one-click Copy JSON  
✅ **Production Ready** - Nginx configuration, systemd service, and deployment guides

## Quick Start

### 1. Clone and Setup

```bash
git clone https://github.com/naturalfunction/kore-supersim-dashboard.git
cd kore-supersim-dashboard

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit .env with your settings
KORE_WEBHOOK_SECRET=your_webhook_secret_here
KORE_WEBHOOK_CALLBACK_URL=https://your-domain.com/webhook/super
```

### 3. Initialize Database

```bash
python3 -c "from app.database import init_db; init_db()"
```

### 4. Start the Application

```bash
python3 run.py
```

The dashboard will be available at: **http://localhost:6001**

### 5. Configure KORE Event Stream

In your KORE Wireless portal:

1. Go to **Event Streams → Destinations**
2. Create a new **Webhook** destination
3. Set URL to: `https://your-domain.com/webhook/super`
4. Set the webhook secret to match your `KORE_WEBHOOK_SECRET`
5. Create a **Streaming Rule** to forward events to this destination

## Project Structure

```
kore-supersim-dashboard/
├── run.py                          # Application entry point
├── config.py                       # Configuration settings
├── requirements.txt                # Python dependencies
├── pyproject.toml                  # Modern Python packaging
├── .env.example                    # Environment variables template
├── app/                            # Main application package
│   ├── __init__.py                 # App factory and initialization
│   ├── routes.py                   # API routes and webhook handler
│   ├── models.py                   # SQLAlchemy database models
│   ├── database.py                 # Database connection and utilities
│   ├── templates/                  # Jinja2 HTML templates
│   │   └── dashboard.html          # Main dashboard interface
│   └── static/                     # Static assets (CSS, JS, images)
│       ├── css/style.css           # Dashboard styling
│       ├── js/dashboard.js         # Frontend JavaScript
│       └── vendor/                 # Third-party libraries (Leaflet, etc.)
├── deployment/                     # Production deployment configs
│   └── nginx.conf                  # Nginx reverse proxy template
```

## Dashboard Views

### 1. Live Events
- Real-time display of recent events (last 100)
- Auto-refresh every 15 seconds (pauses when viewing JSON to prevent reload mid-copy)
- Master-detail layout with event list sidebar and structured detail pane
- Structured and JSON views with one-click Copy JSON button
- Click "Map ↗" to jump to a device's location on the map

### 2. Analytics
- **Event Timeline**: Daily event count over the last 30 days (line chart)
- **Events by Type**: Breakdown of started/updated/ended events with semantic colors
- **RAT Type Distribution**: LTE, NB-IoT, etc. breakdown (doughnut chart)
- **Top Devices by Activity**: Most active devices (horizontal bar)
- **Data Usage per Device**: Data consumption per device (horizontal bar)
- **Top Networks**: Most active mobile operators (horizontal bar)
- **Geographic Distribution**: Events by country (pie chart)
- **Data Usage Overview**: Total data usage in GB/MB/bytes
- **Click-through Drill-Down**: Click any chart segment to jump to Search & Filter with pre-filled filters
- Devices with no name automatically fall back to ICCID in charts

### 3. Map View
- **Global Heatmap**: Visualizes device density (green=online, red=offline)
- **Auto-fit Zoom**: Map automatically zooms to fit all device locations on load
- **Interactive Map**: Zoom and pan to explore global connectivity
- **Device Markers**: Click "Map ↗" on any event to fly to its exact location
- **Show All**: Button resets the view to fit all devices

### 4. Search & Filter
- Filter by SIM ICCID, device name, event type, RAT type, country, and network
- Device name dropdown populated from database (falls back to ICCID for unnamed devices)
- Date range filtering with auto-populated 30-day window
- End date auto-defaults to 23:59 for full-day coverage
- Expandable results with Structured and JSON detail views
- One-click Copy JSON button on each result
- Click "Map ↗" on any result to jump to its location on the map

## API Endpoints

### Webhook Endpoint
```
POST /webhook/super
```
Receives KORE SUPER SIM CloudEvents (JSON array format). Requires `kore-signature` header for security verification.

### Events API
```
GET /api/events?limit=50&offset=0&iccid=<iccid>&event_type=<type>&start_date=<iso>&end_date=<iso>&device_name=<name>&rat_type=<rat>&country=<country>&network=<network>
```
Returns paginated events with optional filtering.

### Statistics API
```
GET /api/stats
```
Returns analytics data (total events, unique SIMs, data usage, event type breakdown, top networks, countries, RAT types, top devices, data per device, daily timeline).

### Devices API
```
GET /api/devices
```
Returns a list of distinct device names for populating filter dropdowns.

### Heatmap API
```
GET /api/heatmap
```
Returns online/offline device locations for the map view.

### Health Check
```
GET /health
```
Returns application health status and database statistics.

## Configuration

The application uses environment variables for configuration. Copy `.env.example` to `.env` and customize:

```bash
# Server Configuration
PORT=6001
HOST=0.0.0.0
DEBUG=False

# KORE Webhook Security (REQUIRED)
KORE_WEBHOOK_SECRET=your_webhook_secret_here
KORE_WEBHOOK_CALLBACK_URL=https://your-domain.com/webhook/super

# Database (optional - defaults to SQLite)
DATABASE_PATH=supersim_events.db
DATA_RETENTION_DAYS=120

# Dashboard Settings (optional)
AUTO_REFRESH_INTERVAL=15
EVENTS_PER_PAGE=50
MAX_EVENTS_LIMIT=1000
```

### Key Configuration Options

- **KORE_WEBHOOK_SECRET**: Secret from KORE Developer Portal (required for security)
- **KORE_WEBHOOK_CALLBACK_URL**: Your webhook URL (must match KORE portal exactly)
- **DATA_RETENTION_DAYS**: How long to keep events (default: 120 days)
- **AUTO_REFRESH_INTERVAL**: Dashboard refresh rate in seconds (default: 15)

See `config.py` for all available options.

## Data Retention

The application automatically deletes events older than 4 months (120 days) to manage database size. The cleanup job runs daily at 2:00 AM.

To manually trigger cleanup:

```python
python -c "from app.database import cleanup_old_events; print(f'Deleted {cleanup_old_events()} events')"
```


## Troubleshooting

### Common Issues

**Webhook signature verification fails:**
- Ensure `KORE_WEBHOOK_SECRET` matches your KORE Developer Portal exactly
- Verify `KORE_WEBHOOK_CALLBACK_URL` matches the URL in KORE portal
- Check logs: `python3 run.py` (look for signature mismatch warnings)

**Events not appearing:**
- Verify webhook endpoint is accessible from internet
- Check KORE Event Stream destination URL is correct
- Test webhook: `curl -X POST http://localhost:6001/webhook/super -H "Content-Type: application/json" -d '[{"id":"test","type":"test","data":{"sim_iccid":"test","timestamp":"2024-01-01T00:00:00Z"}}]'`

**Database issues:**
- Ensure database file is writable
- Check disk space for SQLite database growth
- Restart application if database is locked

## Development

### Local Development Setup

```bash
# Clone repository
git clone https://github.com/your-username/kore-supersim-dashboard.git
cd kore-supersim-dashboard

# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set up environment
cp .env.example .env
# Edit .env with your configuration

# Initialize database
python3 -c "from app.database import init_db; init_db()"

# Run application
python3 run.py
```

### Dependencies

Core dependencies (see `requirements.txt` for versions):
- **Flask** - Web framework
- **SQLAlchemy** - Database ORM  
- **APScheduler** - Background job scheduling
- **python-dateutil** - Date/time utilities
- **python-dotenv** - Environment variable loading

### Modern Python Packaging

This project uses modern Python packaging with `pyproject.toml`:

```bash
# Install in development mode
pip install -e .

# Build distribution packages
pip install build
python -m build
```

## Security

⚠️ **IMPORTANT**: Before deploying to production:

1. **Generate your own webhook secret** in the KORE Developer Portal
2. **Update environment variables** with your actual values:
   ```bash
   export KORE_WEBHOOK_SECRET=your_actual_secret_here
   export KORE_WEBHOOK_CALLBACK_URL=https://your-domain.com/webhook/super
   ```
3. **Never commit real secrets** to version control
4. **Use HTTPS** for all webhook endpoints (KORE requirement)

## Database Management

The application uses SQLite by default with automatic cleanup:

### Automatic Data Retention
- Events older than 120 days are automatically deleted (configurable)
- Cleanup job runs daily at 2:00 AM
- Manual cleanup: `python3 -c "from app.database import cleanup_old_events; print(f'Deleted {cleanup_old_events()} events')"`

### Backup and Maintenance

```bash
# Backup database
sqlite3 supersim_events.db ".backup 'supersim_events.backup.db'"

# Compact database (reduces file size)
sqlite3 supersim_events.db "VACUUM INTO 'supersim_events.compacted.db';"

# Check database size
ls -lh supersim_events.db
```

### Production Database Options
- **SQLite** (default) - Simple, file-based, good for moderate traffic
- **PostgreSQL** - Recommended for high traffic or multi-instance deployments
- **MySQL** - Alternative for existing MySQL infrastructure

To use PostgreSQL/MySQL, update `DATABASE_URL` in your environment.

## License

MIT License - see `LICENSE` file for details.

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes and test thoroughly
4. Commit with clear messages: `git commit -m "Add feature description"`
5. Push to your fork: `git push origin feature-name`
6. Create a Pull Request

## Support

- **Issues**: [GitHub Issues](https://github.com/naturalfunction/kore-supersim-dashboard/issues)
- **KORE SUPER SIM**: [KORE Developer Portal](https://docs.korewireless.com/en-us/supersim/)

---

**Built for KORE Wireless Pre-sales team, for SUPER SIM Event Streams** 🚀
