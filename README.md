# Playlistarr

Playlistarr is a powerful, standalone web application that seamlessly syncs movie and TV show lists from various online sources (like Trakt, Letterboxd, IMDb, SIMKL, and mdblist) directly into your **Emby** and **Jellyfin** media servers as playlists.

It features a beautiful glassmorphic dark-mode web interface and a robust background synchronization engine that keeps your media server playlists perfectly up to date with the online source lists.

## Features

- **Multi-Server Support:** Works natively with both Emby and Jellyfin.
- **Provider Support:** Pull lists directly from Trakt, SIMKL, mdblist, IMDb, Letterboxd, and Serializd.
- **Timeline Sorting:** Automatically respects the custom timeline sorting set by the list creator (e.g., in-universe chronological Marvel Cinematic Universe lists).
- **Admin & Personal Playlists:** Admins can enforce "Global Playlists" that are pushed to every user on the server, while individuals can manage their own personal collections.
- **Background Cron Sync:** A built-in scheduler checks for list updates every hour and mirrors changes instantly.

## Quick Start (Docker Compose)

The easiest way to run Playlistarr is via Docker. 

Create a `docker-compose.yml` file:

```yaml
version: '3.8'

services:
  playlistarr:
    image: ghcr.io/eatprilosec/playlistarr:master
    container_name: playlistarr
    restart: unless-stopped
    ports:
      - "8670:8670"
    volumes:
      # Persists the SQLite database and sync logs
      - ./data:/app/data

> **Note:** The above configuration runs Playlistarr as a single, standalone container.

## Configuration Example

Once the container is running, navigate to `http://localhost:8670` to access the web UI.

### 1. Login
Playlistarr uses your existing Emby or Jellyfin credentials.
- **Server URL:** `http://192.168.1.100:8096`
- **Username:** `YourAdminUsername`
- **Password:** `YourPassword`

### 2. Adding a Playlist
From the Dashboard or Admin view, click **Add Playlist**.

- **Playlist Name:** `MCU Timeline`
- **Provider:** `Trakt`
- **Source List URL:** `https://trakt.tv/users/username/lists/mcu-timeline`

Click **Add Playlist**. Playlistarr will immediately reach out to Trakt, parse the list items in their correct chronological order, match them against the media in your Emby/Jellyfin library, and construct a playlist pushed directly to your account.

### Global Playlists (Admin Only)
If you logged in with an Administrator account, you will see the **Admin** tab. Any playlist added here will be forcefully synchronized to the account of *every user* registered on your Emby/Jellyfin server.
