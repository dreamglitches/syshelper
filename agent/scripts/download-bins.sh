#!/usr/bin/env bash
# download-bins.sh — Download static upterm and tmux binaries into agent/bin/
# Run from the agent/ directory before building.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="$SCRIPT_DIR/../bin"
mkdir -p "$BIN_DIR"

UPTERM_VERSION="0.23.0"  # Pin to a known good release
TMUX_VERSION="3.6a"

UPTERM_BASE="https://github.com/owenthereal/upterm/releases/download/v${UPTERM_VERSION}"
# Static tmux builds from: https://github.com/tmux/tmux-builds
TMUX_BASE="https://github.com/tmux/tmux-builds/releases/download/${TMUX_VERSION}"

download_upterm() {
  local arch="$1" asset="$2"
  local dest="$BIN_DIR/upterm-${arch}"
  if [[ -f "$dest" ]]; then
    echo "  [skip] upterm-${arch} already exists"
    return
  fi
  echo "  Downloading upterm-${arch}..."
  local tmp
  tmp="$(mktemp -d)"
  curl -fsSL "${UPTERM_BASE}/${asset}" -o "${tmp}/${asset}"
  tar -xzf "${tmp}/${asset}" -C "${tmp}" upterm
  mv "${tmp}/upterm" "$dest"
  chmod 0755 "$dest"
  rm -rf "$tmp"
  verify_static "$dest" "upterm-${arch}"
}

download_tmux() {
  local arch="$1" asset="$2"
  local dest="$BIN_DIR/tmux-${arch}"
  if [[ -f "$dest" ]] && [[ -s "$dest" ]]; then
    echo "  [skip] tmux-${arch} already exists"
    return
  fi
  echo "  Downloading tmux-${arch}..."
  local tmp
  tmp="$(mktemp -d)"
  curl -fsSL "${TMUX_BASE}/${asset}" -o "${tmp}/${asset}"
  tar -xzf "${tmp}/${asset}" -C "${tmp}" tmux
  mv "${tmp}/tmux" "$dest"
  chmod 0755 "$dest"
  rm -rf "$tmp"
  verify_static "$dest" "tmux-${arch}"
}

verify_static() {
  local path="$1" name="$2"
  if ! command -v file &>/dev/null; then
    echo "  [warn] 'file' command not found, skipping static check for ${name}"
    return
  fi
  local info
  info="$(file "$path")"
  if echo "$info" | grep -qi "statically linked"; then
    echo "  [ok] ${name} is statically linked"
  else
    echo "  [WARN] ${name} may NOT be statically linked: $info"
    echo "         Verify before shipping!"
  fi
}

echo "==> Downloading upterm v${UPTERM_VERSION}"
download_upterm "amd64"  "upterm_linux_amd64.tar.gz"
download_upterm "arm64"  "upterm_linux_arm64.tar.gz"
# download_upterm "armv7"  "upterm_linux_armv7.tar.gz"
# download_upterm "armv6"  "upterm_linux_armv6.tar.gz"
# download_upterm "386"    "upterm_linux_386.tar.gz"

echo ""
echo "==> Downloading tmux ${TMUX_VERSION} (official static builds: tmux/tmux-builds)"
download_tmux "amd64"  "tmux-${TMUX_VERSION}-linux-x86_64.tar.gz"
download_tmux "arm64"  "tmux-${TMUX_VERSION}-linux-arm64.tar.gz"
# download_tmux "armv7"  "tmux-armv7"
# download_tmux "armv6"  "tmux-armv6"
# download_tmux "386"    "tmux-386"

echo ""
echo "Done. Binaries in: $BIN_DIR"
ls -lh "$BIN_DIR"
