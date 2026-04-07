#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

echo "==> Updating repo"
git pull --ff-only

echo "==> Deploying backend"
bash backend/deploy.sh

echo "==> Building frontend"
cd "$REPO_DIR/frontend"
npm ci
npm run build

echo "==> Reloading nginx (if running)"
if command -v systemctl >/dev/null 2>&1; then
  if systemctl is-active --quiet nginx; then
    sudo systemctl reload nginx
  else
    echo "nginx is not active; skipping reload"
  fi
else
  echo "systemctl not found; skipping nginx reload"
fi

echo "==> Done"

