#!/usr/bin/env bash
set -euo pipefail

# Usage: scripts/deploy.sh [user@host] [remote_path]
# Defaults match the current deployment target if no arguments are supplied.

REMOTE_DEFAULT="${REMOTE_USER_HOST:-cristiano@192.168.3.46}"
REMOTE_PATH_DEFAULT="${REMOTE_PATH:-/mnt/pool/apps/insta-followers}"

REMOTE_HOST="${1:-$REMOTE_DEFAULT}"
REMOTE_PATH="${2:-$REMOTE_PATH_DEFAULT}"

RSYNC_BIN="${RSYNC_BIN:-rsync}"
SSH_BIN="${SSH_BIN:-ssh}"
DOCKER_COMPOSE_CMD="${DOCKER_COMPOSE_CMD:-docker compose}"

RSYNC_EXCLUDES=(
  --exclude '.git'
  --exclude 'node_modules'
  --exclude '.next'
  --exclude 'dist'
  --exclude '.DS_Store'
)

log() {
  printf '[deploy] %s\n' "$*"
}

log "Ensuring remote directory exists: ${REMOTE_HOST}:${REMOTE_PATH}"
"${SSH_BIN}" "${REMOTE_HOST}" "mkdir -p '${REMOTE_PATH}'"

log "Syncing project files to remote host"
"${RSYNC_BIN}" -av --delete "${RSYNC_EXCLUDES[@]}" ./ "${REMOTE_HOST}:${REMOTE_PATH}"

log "Restarting application via docker compose"
"${SSH_BIN}" "${REMOTE_HOST}" "bash -se" <<REMOTE_CMD
set -euo pipefail
cd "${REMOTE_PATH}"
${DOCKER_COMPOSE_CMD} down --remove-orphans
${DOCKER_COMPOSE_CMD} up -d --build
REMOTE_CMD

log "Deployment complete"
