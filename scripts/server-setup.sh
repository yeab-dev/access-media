#!/usr/bin/env bash
# Set up the whole app on a fresh Ubuntu server (for example Oracle Cloud "Always Free"), with free HTTPS.
# Run on the server:   curl -fsSL https://raw.githubusercontent.com/yeab-dev/access-media/main/scripts/server-setup.sh | bash
# or, from a clone:    ./scripts/server-setup.sh
# Safe to run again: it updates the code and restarts; it never replaces an existing .env.
set -euo pipefail
REPO="${REPO:-https://github.com/yeab-dev/access-media.git}"
DIR="${DIR:-$HOME/access-media}"

echo "== Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
fi
DOCKER="docker"; docker info >/dev/null 2>&1 || DOCKER="sudo docker"

echo "== Firewall: web ports 80 and 443"
# Oracle's Ubuntu images block everything but SSH in iptables, in addition to the cloud Security List.
if sudo iptables -L INPUT -n 2>/dev/null | grep -q "REJECT"; then
  for port in 80 443; do
    sudo iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 5 -p tcp --dport "$port" -j ACCEPT
  done
  if command -v netfilter-persistent >/dev/null; then sudo netfilter-persistent save; fi
fi

echo "== Code"
if [ -d "$DIR/.git" ]; then git -C "$DIR" pull --ff-only; else git clone --depth 1 "$REPO" "$DIR"; fi
cd "$DIR"

echo "== Settings (.env)"
IP="$(curl -fsS https://api.ipify.org || hostname -I | awk '{print $1}')"
DOMAIN="${DOMAIN:-${IP//./-}.sslip.io}"
if [ ! -f .env ]; then
  cat > .env <<EOF
ADMIN_TOKEN=$(openssl rand -base64 24 | tr '+/' '-_' | tr -d '=')
PUBLIC_URL=https://$DOMAIN
TRUST_PROXY=1
SIGNUP=open
PROVIDER_MAX_LESSONS=10
PROVIDER_MAX_UPLOAD_MB=200
PROVIDER_MAX_JOBS=50
WHISPER_MODEL=${WHISPER_MODEL:-small}
EOF
  chmod 600 .env
  echo "Made .env with a new master key (ADMIN_TOKEN). See it with: grep ADMIN_TOKEN $DIR/.env"
fi
echo "DOMAIN=$DOMAIN" > .domain

echo "== Start (first build takes a while: ffmpeg, Chromium, whisper.cpp)"
DOMAIN="$DOMAIN" $DOCKER compose --profile https up -d --build
echo
echo "Ready in a minute or two at: https://$DOMAIN"
echo "Check: curl https://$DOMAIN/api/v1/health"
