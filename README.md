# meshsimple

Local Meshtastic monitoring app — persistent map, node list, and channel messaging.

## Setup

Copy `.env.example` to `.env` and fill in your device details:

```
MESHTASTIC_HOST=192.168.1.x   # IP of your Meshtastic device
MESHTASTIC_PORT=4403           # Default TCP port
PORT=8080                      # Host port to expose
```

## Run

```bash
docker-compose up -d
```

Navigate to `http://localhost:8080`.

## Unraid

1. Install the **Docker Compose Manager** plugin from Community Applications
2. Create a new compose stack pointing to this repo (or paste the `docker-compose.yml`)
3. Set environment variables in the stack config:
   - `MESHTASTIC_HOST` — IP address of your Meshtastic device
   - `PORT` — host port (default `8080`)
4. The data volume maps to `/mnt/user/appdata/meshsimple` — set this in the compose or via the Unraid UI
5. Start the stack — navigate to `http://<unraid-ip>:8080`

## Development

```bash
# Backend (requires Python 3.11+)
cd backend && pip install -r requirements.txt
make dev-backend

# Frontend (requires Node 20+)
cd frontend && npm install
make dev-frontend
```

Frontend dev server runs on `:5173` and proxies `/api` and `/ws` to `:8000`.
