#!/usr/bin/env bash
# Release fm-wrap to npm and GitHub Releases.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION_TYPE="${1:-patch}"
if [[ ! "$VERSION_TYPE" =~ ^(patch|minor|major)$ ]]; then
  echo "Usage: $0 [patch|minor|major]" >&2
  exit 1
fi

# --- Preflight checks ---

if ! command -v gh >/dev/null 2>&1; then
  echo "Error: GitHub CLI (gh) is required. Install: https://cli.github.com/" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Error: gh is not authenticated. Run: gh auth login" >&2
  exit 1
fi

BRANCH="$(git branch --show-current)"
if [[ "$BRANCH" != "master" && "$BRANCH" != "main" ]]; then
  echo "Error: release from master/main only (current: $BRANCH)" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Error: working tree is not clean" >&2
  exit 1
fi

# --- Build & test ---

echo "Building..."
bun run build

echo "Running tests..."
bun run test

echo "Type checking..."
bun run typecheck

# --- Dry-run pack ---

echo "Dry-run pack..."
npm pack --dry-run

# --- Confirm ---

read -r -p "Bump $VERSION_TYPE, publish to npm, and create a GitHub release? [y/N] " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "Aborted."
  exit 0
fi

# --- Version bump ---

npm version "$VERSION_TYPE" --no-git-tag-version
VERSION="$(node -p "require('./package.json').version")"
TAG="v${VERSION}"

git add package.json
git commit -m "chore: release ${TAG}"

echo "Creating git tag ${TAG}..."
git tag "${TAG}"

# --- Pack & publish ---

echo "Packing tarball..."
rm -f fm-wrap-*.tgz
npm pack
TARBALL="fm-wrap-${VERSION}.tgz"
if [[ ! -f "$TARBALL" ]]; then
  echo "Error: expected tarball ${TARBALL} not found" >&2
  exit 1
fi

echo "Publishing to npm..."
npm publish --access public

# --- Push & GitHub release ---

echo "Pushing to GitHub..."
git push origin HEAD
git push origin "${TAG}"

echo "Creating GitHub release ${TAG}..."
if gh release view "${TAG}" >/dev/null 2>&1; then
  gh release upload "${TAG}" "${TARBALL}" --clobber
else
  gh release create "${TAG}" \
    --title "fm-wrap ${TAG}" \
    --generate-notes \
    "${TARBALL}"
fi

RELEASE_URL="$(gh release view "${TAG}" --json url --jq .url)"

# --- Cleanup ---

rm -f fm-wrap-*.tgz

echo ""
echo "Release complete:"
echo "  npm:    fm-wrap@${VERSION}"
echo "  github: ${RELEASE_URL}"
