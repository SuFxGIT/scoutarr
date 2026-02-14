# scoutarr

Scoutarr automates media upgrades in your Starr applications (Radarr, Sonarr, Lidarr, and Readarr) by performing manual or automatic searches for media items that meet your criteria and tagging what was searched, so you can continuously chase better quality releases without babysitting your apps.

> **Note:** This project uses [Upgradinatorr](https://github.com/angrycuban13/Just-A-Bunch-Of-Starr-Scripts/tree/main/Upgradinatorr) as its foundation. We've created a modern UI and enhanced the functionality while maintaining the core concept.

## Screenshots

[Dashboard](screenshots/image.png) | [Settings](screenshots/image2.png) | [Stats](screenshots/image3.png)

## Features

- 🎬 **Radarr Integration** – Automatically perform focused manual searches for movies
- 📺 **Sonarr Integration** – Automatically perform focused manual searches for series
- 🎵 **Lidarr Integration** – Automatically perform focused manual searches for music
- 📚 **Readarr Integration** – Automatically perform focused manual searches for books
- 🧠 **Smart Filtering** – Filter by monitored state, movie/series status (including an **Any** option), quality profile, and tags
- 🏷️ **Tag-Aware Workflow** – Only search untagged items, then tag everything that was searched to avoid duplicates
- ⏱️ **Scheduler with Unattended Mode** – Run searches on a schedule; when unattended is enabled, tags are automatically cleared and re-applied when nothing matches, keeping things moving without manual intervention
- 📊 **Dashboard & Stats** – Live-updating dashboard with recent searches, per-app/instance totals, and CF score history tracking
- 🔔 **Notifications** – Discord, Notifiarr, and Pushover support with in-app test buttons
- 🎨 **Modern UI** – Built with Radix UI Themes
- 🐳 **Docker Support** – Easy deployment with Docker Compose
- ⚙️ **Clean Configuration** – Simple JSON-based configuration
- 📝 **Structured Logging** – Organized debugging logs with Winston

## Requirements

- Node.js 20+
- Docker (optional, for containerized deployment)

## Quick Start

### Development

1. Install dependencies:
```bash
npm install
```

2. Start development servers:
```bash
npm run dev
```

3. Open http://localhost:7291 in your browser

### Docker

1. Build and run with Docker Compose:
```bash
docker-compose up -d
```

2. Open http://localhost:5839 in your browser

## Configuration

Configuration is stored in `config/config.json`. On first run, the application will create a default configuration file based on `config/config.example.json`.

### Config Structure

```json
{
  "notifications": {
    "discordWebhook": "",
    "notifiarrPassthroughWebhook": "",
    "notifiarrPassthroughDiscordChannelId": "",
    "pushoverUserKey": "",
    "pushoverApiToken": ""
  },
  "applications": {
    "radarr": [],
    "sonarr": [],
    "lidarr": [],
    "readarr": []
  },
  "scheduler": {
    "enabled": false,
    "schedule": "0 */6 * * *",
    "unattended": false
  }
}
```

## How It Works

1. **Configure** – Set up your Radarr, Sonarr, Lidarr, and Readarr instances, filters, and scheduler in the Settings page.
2. **Run** – Start a search manually from the Dashboard or let the scheduler run automatically.

## Logging

The application uses Winston for structured logging with organized, color-coded output:

- **Console Output**: Color-coded logs with timestamps for easy debugging
- **File Logs**: JSON-formatted logs saved to `logs/` directory:
  - `combined.log` - All logs
  - `error.log` - Error logs only
  - `exceptions.log` - Uncaught exceptions
  - `rejections.log` - Unhandled promise rejections

**Log Levels:**
- `error` - Errors that need attention
- `warn` - Warnings
- `info` - General information
- `http` - HTTP requests/responses
- `debug` - Detailed debugging information

**Environment Variable:**
- `LOG_LEVEL` - Set log level (default: `debug` in development, `info` in production)

## API Endpoints

- `GET /api/config` – Get current configuration
- `PUT /api/config` – Update configuration
- `POST /api/config/test/:app` – Test connection to an application
- `POST /api/config/clear-tags/:app/:instanceId` – Clear tags from all media in a specific instance
- `GET /api/status` – Get connection status for all applications and scheduler state
- `POST /api/search/run` – Run the search for all configured instances
- `POST /api/search/run-preview` – Preview what would be searched for each instance
- `GET /api/stats` – Get aggregated search statistics
- `GET /api/stats/recent` – Get paginated recent searches
- `POST /api/stats/reset` – Reset all statistics
- `POST /api/stats/clear-data` – Clear search history while keeping the database structure
- `POST /api/notifications/test` – Send a test notification (Discord, Notifiarr, or Pushover)
- `POST /api/sync/all` – Trigger media library sync for all instances

## License

MIT

