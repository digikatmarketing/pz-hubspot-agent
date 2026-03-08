#!/usr/bin/env bash

set -euo pipefail

if ! command -v railway >/dev/null 2>&1; then
  echo "Railway CLI not found. Install/login first."
  exit 1
fi

commit_short="$(git rev-parse --short HEAD)"
deploy_message="${1:-Deploy ${commit_short}}"
tmp_dir="$(mktemp -d)"

cleanup() {
  rm -rf "$tmp_dir"
}

trap cleanup EXIT

git archive --format=tar HEAD | tar -xf - -C "$tmp_dir"

echo "Deploying clean HEAD snapshot ${commit_short} to Railway..."
railway deployment up "$tmp_dir" --path-as-root -d -m "$deploy_message"

echo "Deployment triggered. Current Railway status:"
railway service status
