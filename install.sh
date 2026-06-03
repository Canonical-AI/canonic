#!/bin/sh
# Canonic — one-line installer
# curl -fsSL https://raw.githubusercontent.com/Canonical-AI/canonic/main/install.sh | sh
#
# Optional: pin a version
# curl -fsSL ... | sh -s -- --version v0.1.2-alpha

set -u

# --- helpers -----------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m' # no color

info()  { printf "  ${GREEN}→${NC} %s\n" "$*"; }
warn()  { printf "  ${YELLOW}⚠${NC}  %s\n" "$*" >&2; }
err()   { printf "${RED}error:${NC} %s\n" "$*" >&2; exit 1; }

REPO="Canonical-AI/canonic"
VERSION=""

# --- arg parsing -------------------------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    --version) VERSION="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: curl -fsSL https://raw.githubusercontent.com/Canonical-AI/canonic/main/install.sh | sh"
      echo ""
      echo "Options:"
      echo "  --version TAG   Install a specific release (default: latest)"
      exit 0
      ;;
    *) shift ;;
  esac
done

# --- platform detection ------------------------------------------------
OS=$(uname -s)
ARCH=$(uname -m)

case "$OS" in
  Darwin) PLATFORM="macos" ;;
  Linux)  PLATFORM="linux" ;;
  *)      err "Unsupported OS: $OS (macOS or Linux required)" ;;
esac

case "$ARCH" in
  arm64|aarch64) ARCH_NORM="arm64" ;;
  x86_64|amd64)  ARCH_NORM="x86_64" ;;
  *)             err "Unsupported architecture: $ARCH" ;;
esac

if [ "$PLATFORM" = "macos" ] && [ "$ARCH_NORM" != "arm64" ]; then
  err "Canonic only builds for Apple Silicon (arm64) on macOS. Intel Macs are not supported."
fi

# --- resolve version ---------------------------------------------------
if [ -z "$VERSION" ]; then
  info "Fetching latest release…"
  VERSION=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep '"tag_name":' \
    | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/') \
    || err "Could not fetch latest release from GitHub API"
fi

info "Installing Canonic ${VERSION} for ${PLATFORM}/${ARCH_NORM}"

# --- pick the right asset -----------------------------------------------
case "${PLATFORM}-${ARCH_NORM}" in
  macos-arm64)
    ASSET="canonic-arm64.zip"
    ASSET_TYPE="zip"
    ;;
  linux-x86_64)
    ASSET="canonic-x86_64.AppImage"
    ASSET_TYPE="appimage"
    ;;
  linux-arm64)
    ASSET="canonic-arm64.AppImage"
    ASSET_TYPE="appimage"
    ;;
esac

DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${VERSION}/${ASSET}"

# --- download -----------------------------------------------------------
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

info "Downloading ${ASSET}…"
curl -fsSL --progress-bar -o "${TMPDIR}/${ASSET}" "$DOWNLOAD_URL" \
  || err "Download failed"

# --- install ------------------------------------------------------------
case "$PLATFORM" in
  macos)
    info "Extracting…"
    unzip -qo "${TMPDIR}/${ASSET}" -d "$TMPDIR" || err "Unzip failed"

    APP_NAME="Canonic.app"
    if [ -d "/Applications/${APP_NAME}" ]; then
      warn "Existing Canonic.app found in /Applications — replacing"
      rm -rf "/Applications/${APP_NAME}"
    fi

    info "Installing to /Applications/Canonic.app…"
    mv "${TMPDIR}/${APP_NAME}" /Applications/ \
      || err "Could not move to /Applications (try running with sudo)"

    # Remove quarantine flag so Gatekeeper doesn't block it
    if ! xattr -d com.apple.quarantine "/Applications/${APP_NAME}" 2>/dev/null; then
      warn "Could not clear quarantine flag. You may need to right-click → Open the app."
    fi
    ;;

  linux)
    INSTALL_DIR="${HOME}/.local/bin"
    mkdir -p "$INSTALL_DIR"

    info "Installing to ${INSTALL_DIR}/canonic…"
    cp "${TMPDIR}/${ASSET}" "${INSTALL_DIR}/canonic" \
      || err "Could not copy to ${INSTALL_DIR}"
    chmod +x "${INSTALL_DIR}/canonic"

    if ! echo "$PATH" | tr ':' '\n' | grep -Fqx "$INSTALL_DIR"; then
      warn "${INSTALL_DIR} is not in your PATH."
      echo "  Add this to your shell config (~/.bashrc, ~/.zshrc, etc.):"
      echo "    export PATH=\"\$HOME/.local/bin:\$PATH\""
    fi
    ;;
esac

echo ""
printf "  ${GREEN}✓${NC} Canonic ${BOLD}${VERSION}${NC} installed successfully!\n"
echo ""
echo "  Launch it from your app launcher (macOS) or run:"
echo "    ${BOLD}canonic${NC}"
echo ""
