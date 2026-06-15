#!/bin/sh
# Canonic — one-line installer
# curl -fsSL https://raw.githubusercontent.com/Canonical-AI/canonic/main/install.sh | sh
#
# Optional: pin a version
# curl -fsSL ... | sh -s -- --version v0.2.2-alpha

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
  # The macOS .dmg is a universal binary, but the installer is only verified on
  # Apple Silicon. Intel Macs can use the .dmg from the Releases page directly.
  warn "Intel Macs are not officially supported; the universal .dmg may still work."
fi

# --- Linux distro detection --------------------------------------------
# Arch and Alpine get the Flatpak instead of the AppImage (both arches):
#   • Alpine is musl-libc — the glibc AppImage will not run at all.
#   • Arch ships no FUSE by default, so AppImages need extra setup; the Flatpak
#     bundles its own GNOME runtime and just works.
# Flatpak bundles are built for both x86_64 and aarch64, so no per-arch fallback.
INSTALL_METHOD="appimage"   # default for Linux
DISTRO_PRETTY="Linux"

if [ "$PLATFORM" = "linux" ]; then
  DISTRO_ID=""
  DISTRO_LIKE=""
  if [ -r /etc/os-release ]; then
    # Parse rather than `source` so we don't clobber $VERSION (os-release
    # defines its own VERSION=).
    DISTRO_ID=$(grep -E '^ID='      /etc/os-release | head -n1 | cut -d= -f2 | tr -d '"')
    DISTRO_LIKE=$(grep -E '^ID_LIKE=' /etc/os-release | head -n1 | cut -d= -f2 | tr -d '"')
    DISTRO_PRETTY=$(grep -E '^PRETTY_NAME=' /etc/os-release | head -n1 | cut -d= -f2 | tr -d '"')
  fi
  [ -f /etc/alpine-release ] && DISTRO_ID="alpine"
  [ -f /etc/arch-release ]   && [ -z "$DISTRO_ID" ] && DISTRO_ID="arch"
  [ -z "$DISTRO_PRETTY" ] && DISTRO_PRETTY="Linux"

  case " ${DISTRO_ID} ${DISTRO_LIKE} " in
    *" alpine "* | *" arch "*)
      INSTALL_METHOD="flatpak"
      ;;
  esac
fi

# --- resolve version ---------------------------------------------------
if [ -z "$VERSION" ]; then
  info "Fetching latest release…"
  VERSION=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep '"tag_name":' \
    | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/') \
    || err "Could not fetch latest release from GitHub API"
fi

# Release assets embed the bare version (no leading "v"); the tag keeps it.
VERSION_NOV="${VERSION#v}"

info "Installing Canonic ${VERSION} for ${PLATFORM}/${ARCH_NORM}"

# --- pick the right asset ----------------------------------------------
# Names match Tauri's bundle output (productName=canonic), exactly as attached
# to each GitHub release.
case "$PLATFORM" in
  macos)
    ASSET="canonic_${VERSION_NOV}_universal.dmg"
    ;;
  linux)
    if [ "$INSTALL_METHOD" = "flatpak" ]; then
      # Flatpak bundles use x86_64 / aarch64 in their filename.
      [ "$ARCH_NORM" = "x86_64" ] && FLATPAK_ARCH="x86_64" || FLATPAK_ARCH="aarch64"
      ASSET="canonic_${VERSION_NOV}_${FLATPAK_ARCH}.flatpak"
    elif [ "$ARCH_NORM" = "x86_64" ]; then
      ASSET="canonic_${VERSION_NOV}_amd64.AppImage"
    else
      ASSET="canonic_${VERSION_NOV}_aarch64.AppImage"
    fi
    ;;
esac

DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${VERSION}/${ASSET}"

# --- download ----------------------------------------------------------
TMPDIR=$(mktemp -d)
MOUNT=""
cleanup() {
  [ -n "$MOUNT" ] && hdiutil detach "$MOUNT" >/dev/null 2>&1
  rm -rf "$TMPDIR"
}
trap cleanup EXIT

info "Downloading ${ASSET}…"
curl -fsSL --progress-bar -o "${TMPDIR}/${ASSET}" "$DOWNLOAD_URL" \
  || err "Download failed (${DOWNLOAD_URL})"

# --- install -----------------------------------------------------------
LAUNCH_HINT="canonic"

case "$PLATFORM" in
  macos)
    info "Mounting ${ASSET}…"
    MOUNT=$(mktemp -d)
    hdiutil attach -nobrowse -quiet -mountpoint "$MOUNT" "${TMPDIR}/${ASSET}" \
      || err "Could not mount DMG"

    APP_SRC=$(find "$MOUNT" -maxdepth 1 -name '*.app' | head -n1)
    [ -n "$APP_SRC" ] || err "No .app found inside the DMG"
    APP_NAME=$(basename "$APP_SRC")

    if [ -d "/Applications/${APP_NAME}" ]; then
      warn "Existing /Applications/${APP_NAME} found — replacing"
      rm -rf "/Applications/${APP_NAME}"
    fi

    info "Installing to /Applications/${APP_NAME}…"
    cp -R "$APP_SRC" /Applications/ \
      || err "Could not copy to /Applications (try running with sudo)"

    # Remove quarantine flag so Gatekeeper doesn't block it
    if ! xattr -dr com.apple.quarantine "/Applications/${APP_NAME}" 2>/dev/null; then
      warn "Could not clear quarantine flag. You may need to right-click → Open the app."
    fi
    LAUNCH_HINT="open -a ${APP_NAME%.app}"
    ;;

  linux)
    if [ "$INSTALL_METHOD" = "flatpak" ]; then
      command -v flatpak >/dev/null 2>&1 || err "Flatpak is required on ${DISTRO_PRETTY} but isn't installed.
  Install it, then re-run this script:
    Alpine: doas apk add flatpak
    Arch:   sudo pacman -S flatpak"

      # The bundle depends on the GNOME runtime; Flathub provides it.
      info "Ensuring Flathub remote…"
      flatpak remote-add --if-not-exists --user \
        flathub https://flathub.org/repo/flathub.flatpakrepo \
        || warn "Could not add Flathub remote; runtime download may fail."

      # --noninteractive disables flatpak's animated progress UI. Over a
      # `curl … | sh` pipe that UI emits terminal cursor-position queries whose
      # replies aren't consumed and leak as `^[[..R` noise; it also auto-answers
      # the runtime EOL/migration prompt instead of blocking on stdin.
      info "Installing Canonic Flatpak…"
      flatpak install --user -y --noninteractive "${TMPDIR}/${ASSET}" \
        || err "flatpak install failed"
      LAUNCH_HINT="flatpak run ai.canonic.app"
    else
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
      LAUNCH_HINT="canonic"
    fi
    ;;
esac

echo ""
printf "  ${GREEN}✓${NC} Canonic ${BOLD}${VERSION}${NC} installed successfully!\n"
echo ""
echo "  Launch it from your app launcher, or run:"
echo "    ${BOLD}${LAUNCH_HINT}${NC}"
echo ""
