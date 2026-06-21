#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# One-time provisioning for a fresh Ubuntu 22.04/24.04 VM (e.g. Oracle Cloud
# Always-Free ARM). Installs Docker, Node, PM2, Caddy and builds the judge images.
#
# Usage (from the repo root on the server):
#   bash backend/scripts/setup-vm.sh
#
# After it finishes, LOG OUT and back in once (so the docker group applies), then
# follow DEPLOYMENT.md from "Configure & start the backend".
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "==> Updating apt"
sudo apt-get update -y
sudo apt-get upgrade -y

echo "==> Installing Docker Engine"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo systemctl enable --now docker
# Let the current (non-root) user run docker without sudo. Takes effect on next login.
sudo usermod -aG docker "$USER"

echo "==> Installing Node.js 20 LTS"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

echo "==> Installing PM2"
sudo npm install -g pm2

echo "==> Installing Caddy (reverse proxy / HTTPS)"
if ! command -v caddy >/dev/null 2>&1; then
  sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update -y
  sudo apt-get install -y caddy
fi

echo "==> Building judge Docker images (this pulls base images; takes a few minutes)"
# Needs docker group membership. If this is the very first run and you haven't
# re-logged-in yet, fall back to sudo so the build still succeeds.
if docker info >/dev/null 2>&1; then
  bash "$REPO_ROOT/backend/docker/build.sh"
else
  sudo bash "$REPO_ROOT/backend/docker/build.sh"
fi

echo ""
echo "==> Done. Next:"
echo "    1. Log out and back in (so 'docker' works without sudo)."
echo "    2. cd backend && cp .env.production.example .env  (fill in real values)"
echo "    3. npm install --omit=dev && pm2 start ecosystem.config.js && pm2 save && pm2 startup"
echo "    4. Edit /etc/caddy/Caddyfile (copy from repo root Caddyfile) and: sudo systemctl reload caddy"
