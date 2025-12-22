# Quick Start Guide

## Development Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start development servers:**
   ```bash
   npm run dev
   ```
   - Frontend: http://localhost:7291
   - Backend: http://localhost:5839

## Docker Setup

1. **Build and run:**
   ```bash
   docker-compose up -d
   ```

2. **Access the application:**
   - Open http://localhost:5839

3. **View logs:**
   ```bash
   docker-compose logs -f
   ```

## Configuration

1. The application will automatically create `config/config.json` on first run
2. Configure your Radarr/Sonarr instances in the Settings page
3. Test connections before running searches
4. Use the Dashboard to preview (dry-run) and execute searches

## Features

- ✅ Modern UI with Radix UI Themes
- ✅ Clean JSON configuration
- ✅ Radarr and Sonarr integration
- ✅ Dry-run preview
- ✅ Connection testing
- ✅ Automatic tagging
- ✅ Docker support

