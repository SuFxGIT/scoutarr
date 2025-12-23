# scoutarr

A web-based UI for Upgradinatorr functionality - automate searching for upgrades in Radarr, Sonarr, Lidarr, and Readarr.

## Features

- 🎬 **Radarr Integration** - Automatically search for movie upgrades
- 📺 **Sonarr Integration** - Automatically search for TV series upgrades
- 🎵 **Lidarr Integration** - Automatically search for music upgrades
- 📚 **Readarr Integration** - Automatically search for book upgrades
- 🎨 **Modern UI** - Built with Radix UI Themes and Tailwind CSS
- 🐳 **Docker Support** - Easy deployment with Docker Compose
- ⚙️ **Clean Configuration** - Simple JSON-based configuration
- 📝 **Structured Logging** - Organized debugging logs with Winston

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
    "notifiarrPassthroughDiscordChannelId": ""
  },
  "applications": {
    "radarr": [],
    "sonarr": []
  },
  "scheduler": {
    "enabled": false,
    "schedule": "0 */6 * * *",
    "unattended": false
  }
}
```

## How It Works

1. **Configure** - Set up your Radarr/Sonarr instances in the Settings page
2. **Preview** - Use the dry-run feature to see what would be searched
3. **Run** - Execute the search to find and upgrade media items
4. **Tag** - Items that are searched are automatically tagged to prevent duplicate searches

The application filters items based on:
- Monitored status
- Movie/Series status
- Quality profile
- Existing tags (ignores items with the ignore tag, only searches items without the tag name)

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

- `GET /api/config` - Get current configuration
- `PUT /api/config` - Update configuration
- `POST /api/config/test/:app` - Test connection to an application
- `GET /api/status` - Get connection status for all applications
- `POST /api/search/run` - Run the search
- `POST /api/search/dry-run` - Preview what would be searched

## License

MIT

