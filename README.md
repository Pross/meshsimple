# meshsimple

Self-hosted Meshtastic monitoring app. Displays a live map of all mesh nodes, persistent channel 0 messaging (send and receive), and a node list — in a single Docker container.

![meshsimple](https://raw.githubusercontent.com/Pross/meshsimple/main/frontend/public/icon.png)

## Features

- Live node map (OpenStreetMap) with clustering and your own node highlighted
- Node list with last heard, battery, SNR, hops, hardware model, firmware version
- Channel 0 messaging — send and receive, fully persistent across restarts
- Unread message count in sidebar and browser tab title
- Light / dark / system theme
- Connects to your Meshtastic device over TCP/WiFi

## Requirements

- A Meshtastic device accessible over TCP (most devices support this via WiFi)
- Docker

## Unraid

Add a new container via the Docker tab:

| Field | Value |
|---|---|
| Repository | `ghcr.io/pross/meshsimple:latest` |
| Port | `8080` (host) → `8080` (container), TCP |
| Variable | `MESHTASTIC_HOST` = IP of your Meshtastic device |
| Variable | `MESHTASTIC_PORT` = `4403` (default) |
| Path | `/mnt/user/appdata/meshsimple` → `/app/data` |

## Docker

```bash
docker run -d \
  --name meshsimple \
  -p 8080:8080 \
  -e MESHTASTIC_HOST=192.168.1.x \
  -e MESHTASTIC_PORT=4403 \
  -v /path/to/data:/app/data \
  ghcr.io/pross/meshsimple:latest
```

Or with Docker Compose:

```bash
cp .env.example .env
# Edit .env with your device IP
docker compose up -d
```

Navigate to `http://<host-ip>:8080`.

## Development

Requires Python 3.11+ and Node 20+.

```bash
# Backend
cd backend && pip install -r requirements.txt
make dev-backend

# Frontend (in a separate terminal)
cd frontend && npm install
make dev-frontend
```

Frontend dev server runs on `:5173` and proxies `/api` and `/ws` to the backend on `:8000`.

## Licence

MIT
