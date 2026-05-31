#!/usr/bin/env bash
# install.sh — Install the syshelper agent binary and systemd service.
set -euo pipefail

GITHUB_REPO="your-org/syshelper"  # Update before release
RELEASE_TAG="latest"
BINARY_NAME="syshelper"

# ── Detect privilege ──────────────────────────────────────────────────────────
if [[ $EUID -eq 0 ]]; then
  PRIVILEGE="root (system-wide)"
  BIN_DIR="/usr/bin"
  SERVICE_DIR="/etc/systemd/system"
  SERVICE_FLAGS=""
  EXEC_PATH="/usr/bin/syshelper"
  IS_ROOT=1
else
  PRIVILEGE="user (~/.local)"
  BIN_DIR="$HOME/.local/bin"
  SERVICE_DIR="$HOME/.config/systemd/user"
  SERVICE_FLAGS="--user"
  EXEC_PATH="%h/.local/bin/syshelper"
  IS_ROOT=0
fi

# ── Detect architecture ───────────────────────────────────────────────────────
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64)           ARCH_SUFFIX="amd64"  ;;
  aarch64|arm64)    ARCH_SUFFIX="arm64"  ;;
  armv7l|armv7)     ARCH_SUFFIX="armv7"  ;;
  armv6l|armv6)     ARCH_SUFFIX="armv6"  ;;
  i386|i686)        ARCH_SUFFIX="386"    ;;
  *)
    echo "Unsupported architecture: $ARCH"
    exit 1
    ;;
esac

BINARY_URL="https://github.com/${GITHUB_REPO}/releases/${RELEASE_TAG}/download/${BINARY_NAME}-linux-${ARCH_SUFFIX}"

# ── Print plan ────────────────────────────────────────────────────────────────
echo ""
echo "Syshelper Install"
echo "---"
echo "  Privilege  : $PRIVILEGE"
echo "  Binary     : ${BIN_DIR}/${BINARY_NAME}"
echo "  Service    : ${SERVICE_DIR}/syshelper.service"
echo "  Download   : $BINARY_URL"
echo ""
read -rp "Proceed? [y/N] " confirm
[[ "$confirm" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }

# ── Download ──────────────────────────────────────────────────────────────────
TMP_BIN="$(mktemp)"
echo "Downloading ${BINARY_NAME}-linux-${ARCH_SUFFIX}..."
curl -fsSL "$BINARY_URL" -o "$TMP_BIN"

# ── Sanity check ──────────────────────────────────────────────────────────────
chmod 0755 "$TMP_BIN"
if ! "$TMP_BIN" --version &>/dev/null; then
  echo "Sanity check failed: downloaded binary did not run successfully."
  rm -f "$TMP_BIN"
  exit 1
fi
echo "Sanity check passed: $("$TMP_BIN" --version)"

# ── Install binary ────────────────────────────────────────────────────────────
mkdir -p "$BIN_DIR"
mv "$TMP_BIN" "${BIN_DIR}/${BINARY_NAME}"
chmod 0755 "${BIN_DIR}/${BINARY_NAME}"
echo "Installed: ${BIN_DIR}/${BINARY_NAME}"

# ── Write service file ────────────────────────────────────────────────────────
mkdir -p "$SERVICE_DIR"

if [[ $IS_ROOT -eq 1 ]]; then
  cat > "${SERVICE_DIR}/syshelper.service" <<EOF
[Unit]
Description=Syshelper Agent
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=${BIN_DIR}/${BINARY_NAME}
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
else
  cat > "${SERVICE_DIR}/syshelper.service" <<EOF
[Unit]
Description=Syshelper Agent
After=network.target

[Service]
ExecStart=${EXEC_PATH}
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
EOF
  # Enable lingering so user services survive logout
  loginctl enable-linger "$(whoami)" 2>/dev/null || true
fi

# ── Enable and start ──────────────────────────────────────────────────────────
systemctl $SERVICE_FLAGS daemon-reload
systemctl $SERVICE_FLAGS enable --now syshelper

echo ""
echo "Syshelper installed and running."
echo "Check status: systemctl $SERVICE_FLAGS status syshelper"
