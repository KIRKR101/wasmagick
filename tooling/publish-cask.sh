#!/usr/bin/env bash
set -euo pipefail

# Generate the WASMagick Homebrew cask and publish it to the homebrew tap.
#
# Usage:
#   tooling/publish-cask.sh <dmg> [dmg ...]
#
# Each <dmg> is a path to a built WASMagick DMG, or a directory containing
# DMGs. The script detects the architecture from the filename (*-arm64.dmg /
# *-x64.dmg) and embeds the sha256 in the matching cask block.
#
# Environment:
#   HOMEBREW_TAP_TOKEN  Fine-grained PAT with Contents: write on the tap repo (required)
#   SOURCE_REPO         Repo whose GitHub Releases host the DMGs (default: this repo's origin)
#   TAP_REPO            Tap repository (default: KIRKR101/homebrew-tap)
#   VERSION             Version to publish, e.g. "0.0.1" (default: latest git tag)
#   DRY_RUN             Set to 1 to print the cask to stdout without publishing

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

SOURCE_REPO="${SOURCE_REPO:-$(git -C "$REPO_ROOT" remote get-url origin | sed -E 's#^.*github.com[:/]##; s#\.git$##')}"
TAP_REPO="${TAP_REPO:-KIRKR101/homebrew-tap}"
TOKEN="${HOMEBREW_TAP_TOKEN:-}"
VERSION="${VERSION:-$(git -C "$REPO_ROOT" describe --tags --abbrev=0 | sed 's/^v//')}"
VERSION="${VERSION#v}"
VERSION="${VERSION#v}"
BASE_URL="https://github.com/${SOURCE_REPO}/releases/download/v#{version}"
HOMEPAGE="https://github.com/${SOURCE_REPO}"

PRODUCT="WASMagick"
APP_NAME="WASMagick"
DESC="Client-side image editor powered by WebAssembly ImageMagick"

DMGS=()
for f in "$@"; do
  if [[ -d "$f" ]]; then
    while IFS= read -r -d '' d; do DMGS+=("$d"); done < <(find "$f" -name '*.dmg' -print0)
  elif [[ -f "$f" ]]; then
    DMGS+=("$f")
  else
    echo "warning: not found: $f" >&2
  fi
done

ARM_SHA=""
INTEL_SHA=""
for dmg in "${DMGS[@]}"; do
  case "$dmg" in
    *-arm64.dmg)
      ARM_SHA="$(shasum -a 256 "$dmg" | awk '{ print $1 }')"
      ;;
    *-x64.dmg)
      INTEL_SHA="$(shasum -a 256 "$dmg" | awk '{ print $1 }')"
      ;;
    *)
      echo "warning: ignoring unrecognized asset: $dmg (expected *-arm64.dmg or *-x64.dmg)" >&2
      ;;
  esac
done

if [[ -z "$ARM_SHA" && -z "$INTEL_SHA" ]]; then
  echo "error: no WASMagick DMGs found to publish" >&2
  exit 1
fi

RUBY=""
RUBY+="cask \"wasmagick\" do\n"
RUBY+="  arch arm: \"arm64\", intel: \"x64\"\n\n"
RUBY+="  version \"$VERSION\"\n"

if [[ -n "$ARM_SHA" && -n "$INTEL_SHA" ]]; then
  RUBY+="  sha256 arm:   \"$ARM_SHA\",\n"
  RUBY+="         intel: \"$INTEL_SHA\"\n\n"
elif [[ -n "$ARM_SHA" ]]; then
  RUBY+="  sha256 \"$ARM_SHA\"\n\n"
else
  RUBY+="  sha256 \"$INTEL_SHA\"\n\n"
fi

RUBY+="  url \"${BASE_URL}/${PRODUCT}-#{version}-#{arch}.dmg\",\n"
RUBY+="      verified: \"github.com/${SOURCE_REPO%%/*}/\"\n"
RUBY+="  name \"WASMagick\"\n"
RUBY+="  desc \"$DESC\"\n"
RUBY+="  homepage \"$HOMEPAGE\"\n\n"
RUBY+="  depends_on macos: :monterey\n\n"
RUBY+="  app \"${APP_NAME}.app\"\n\n"
RUBY+="  zap trash: [\n"
RUBY+="    \"~/Library/Application Support/WASMagick\",\n"
RUBY+="    \"~/Library/Preferences/com.wasmagick.app.plist\",\n"
RUBY+="  ]\n"
RUBY+="end"

if [[ "${DRY_RUN:-}" == "1" ]]; then
  printf '%b\n' "$RUBY"
  exit 0
fi

if [[ -z "$TOKEN" ]]; then
  echo "error: HOMEBREW_TAP_TOKEN is required (or set DRY_RUN=1 to preview the cask)" >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

git clone --depth 1 "https://x-access-token:${TOKEN}@github.com/${TAP_REPO}.git" "$TMP/tap"
mkdir -p "$TMP/tap/Casks"
printf '%b\n' "$RUBY" > "$TMP/tap/Casks/wasmagick.rb"

git -C "$TMP/tap" add Casks/wasmagick.rb

if git -C "$TMP/tap" diff --cached --quiet; then
  echo "cask is unchanged; skipping push"
  exit 0
fi

git -C "$TMP/tap" config user.name "wasmagick release bot"
git -C "$TMP/tap" config user.email "104659112+KIRKR101@users.noreply.github.com"
git -C "$TMP/tap" commit -m "chore: bump wasmagick to $VERSION"
git -C "$TMP/tap" push

echo "published wasmagick $VERSION to ${TAP_REPO} (Casks/wasmagick.rb)"