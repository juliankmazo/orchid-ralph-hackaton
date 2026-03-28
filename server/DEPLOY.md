# Orchid Server Deployment

## Target

- **Droplet:** orchid-deploy (DigitalOcean)
- **IP:** 24.144.97.81
- **OS:** Ubuntu 24.04 LTS
- **SSH:** `ssh -i <key-file> root@24.144.97.81` (key in `.secrets` at repo root)

## Prerequisites on Droplet

- Node.js 22.x (via NodeSource)
- PostgreSQL 16
- pm2 (installed globally via npm)

## Database Setup

```bash
sudo -u postgres psql -c "CREATE USER orchid WITH PASSWORD 'orchid_poc_2024';"
sudo -u postgres psql -c "CREATE DATABASE orchid OWNER orchid;"
```

Migrations run automatically on server start (`CREATE TABLE IF NOT EXISTS`).

## Deploying

1. **Sync code** (from repo root):
   ```bash
   rsync -avz --exclude node_modules --exclude dist \
     -e "ssh -i /tmp/orchid-deploy/id_ed25519 -o StrictHostKeyChecking=no" \
     server/ root@24.144.97.81:/opt/orchid-server/
   ```

2. **Install deps and build** on the droplet:
   ```bash
   ssh root@24.144.97.81 'cd /opt/orchid-server && npm install && npm run build'
   ```

3. **Restart**:
   ```bash
   ssh root@24.144.97.81 'pm2 restart orchid-server'
   ```

## pm2 Configuration

The server is managed by pm2 with `/opt/orchid-server/ecosystem.config.js`:

```js
module.exports = {
  apps: [{
    name: "orchid-server",
    script: "dist/index.js",
    cwd: "/opt/orchid-server",
    env: {
      NODE_ENV: "production",
      PORT: "3000",
      DATABASE_URL: "postgresql://orchid:orchid_poc_2024@localhost:5432/orchid",
      API_KEY: "orchid-poc-api-key-2024"
    }
  }]
};
```

pm2 is configured to auto-start on boot via `pm2 startup` + `pm2 save`.

## Environment Variables

| Variable       | Value                                                    |
|----------------|----------------------------------------------------------|
| `PORT`         | `3000`                                                   |
| `DATABASE_URL` | `postgresql://orchid:orchid_poc_2024@localhost:5432/orchid` |
| `API_KEY`      | `orchid-poc-api-key-2024`                                |

## Verification

```bash
curl http://24.144.97.81:3000/health
# → {"status":"ok"}
```

## Useful Commands

```bash
pm2 status          # Check process status
pm2 logs orchid-server  # View logs
pm2 restart orchid-server  # Restart
pm2 stop orchid-server     # Stop
```
