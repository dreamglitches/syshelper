# Syshelper

Distributed terminal session management — Go agent + Cloudflare Workers backend + React dashboard + Telegram bot.

## Repository Layout

```
syshelper/
├── agent/          Go binary (linux/amd64, arm64, armv7, armv6, 386)
├── manager/        Cloudflare Worker API (TypeScript + D1)
└── web/            React dashboard (Cloudflare Pages)
```

---

## Quick Start

### 1. Manager — Deploy the Worker

```bash
cd manager
npm install

# Create D1 database
wrangler d1 create syshelper
# → Copy the database_id into wrangler.toml

# Apply schema
npm run db:init:remote

# Set secrets
wrangler secret put AGENT_TOKEN
wrangler secret put WEB_PASSWORD_INITIAL
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_CHAT_ID
wrangler secret put TELEGRAM_WEBHOOK_SECRET

# Deploy
npm run deploy
```

### 2. Web — Deploy to Cloudflare Pages

```bash
cd web
npm install
npm run build

# Deploy dist/ to Cloudflare Pages
# Set build output directory: dist
# Update web/public/_redirects with your Worker URL
```

### 3. Agent — Build

```bash
cd agent

# 1. Download static upterm + tmux binaries
bash scripts/download-bins.sh

# 2. Build for each architecture
GOOS=linux GOARCH=amd64 go build \
  -ldflags "-X main.primaryManager=https://syshelper-manager.workers.dev \
            -X main.fallbackManager=https://syshelper-backup.workers.dev \
            -X main.authToken=<your-token> \
            -X main.agentVersion=1.0.0" \
  -o syshelper-linux-amd64 .

# ARM (must set both GOARM and goArm ldflag):
GOOS=linux GOARCH=arm GOARM=7 go build \
  -ldflags "... -X main.goArm=7" \
  -o syshelper-linux-armv7 .

GOOS=linux GOARCH=arm GOARM=6 go build \
  -ldflags "... -X main.goArm=6" \
  -tags arm6 \
  -o syshelper-linux-armv6 .
```

### 4. Install on a Server

```bash
curl -fsSL https://your-pages.dev/install.sh | bash
```

---

## Telegram Bot Setup

```bash
# Register the webhook (run once after deploying)
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://syshelper-manager.workers.dev/telegram" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

**Commands:** `/servers` `/status` `/connect` `/kill` `/recreate` `/session` `/interval` `/expiry` `/upterm` `/authkey` `/resetpassword`

---

## Architecture Notes

- Agent is **fully stateless** — no config files, no logs, no output
- All state lives in D1 (Cloudflare SQLite)
- `offline` status is never stored — derived from `last_seen` at read time
- Upterm sessions **survive agent restarts and upgrades** via PID adoption
- SSH host key is deterministic: `sha256("syshelper-host-key-v1:" + machineID + ":" + uptermServer)`
- Only one external npm dependency: `bcryptjs` (Worker only)

---

## Development

```bash
# Worker (local)
cd manager && wrangler dev

# Web (local, proxies /api to wrangler dev on :8787)
cd web && npm run dev

# Agent (build check only — placeholder bins are empty)
cd agent && GOOS=linux GOARCH=amd64 go build ./...
```
