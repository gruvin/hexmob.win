#!/bin/zsh
# scripts/release.sh — guided production release for hexmob.win
#
# One command for the whole ceremony, with the operator confirming at the two points that
# actually matter (the production deploy, and which GitHub release the build lands in):
#
#   1. verify we start from a clean dev
#   2. merge dev -> master
#   3. derive the next version and create a SIGNED tag on master
#   4. run the production deploy (deploy.sh prompts as usual; both brands, then both hosts)
#   5. require the signed archive to exist
#   6. push master + tags
#   7. put the build on GitHub: retag the current release onto the new tag, replace its
#      assets, append a line to its "Changes" notes - or create a new release for a milestone
#
# Background worth knowing (AGENTS.md §5): tags are per build, and the release is a moving
# pointer that always carries the build currently served. Releases exist so the signed source
# can be checked against what a browser actually runs, not as a distribution channel. The
# conventional "one release per version with regenerated notes" model does not apply here.

GIT=$(command -v git)
GH=$(command -v gh)

if [[ ! ( -f ./index.html && -d ./src ) ]]; then
    print "ERROR: run from project root"
    exit 1
fi

if [[ -z "${GH}" ]]; then
    print "ERROR: gh CLI not found — install with: brew install gh"
    exit 1
fi

# ── 1. Start from dev, with nothing uncommitted ──────────────────────────────
CURRENT_BRANCH=$(${GIT} rev-parse --abbrev-ref HEAD)
if [[ "$CURRENT_BRANCH" != "dev" ]]; then
    print "ERROR: expected to be on dev branch, currently on '${CURRENT_BRANCH}'"
    exit 1
fi
if [[ -n "$(${GIT} status --porcelain --untracked-files=normal)" ]]; then
    print "ERROR: working tree is not clean. Commit or stash your work first:"
    ${GIT} status --short
    exit 1
fi

# ── 2. Merge dev into master ─────────────────────────────────────────────────
print "\nMerging dev → master ..."
${GIT} checkout master || { print "ERROR: checkout master failed"; exit 1 }
${GIT} merge dev       || { print "ERROR: merge dev failed"; ${GIT} checkout dev; exit 1 }

# ── 3. Pick the next version ─────────────────────────────────────────────────
print "\nRecent tags (newest first):"
${GIT} tag --sort=-v:refname | head -10 | sed 's/^/  /'

LATEST_TAG=$(${GIT} tag --sort=-v:refname | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' | head -1)
if [[ -n "$LATEST_TAG" ]]; then
    NEXT_PATCH=$(( ${LATEST_TAG##*.} + 1 ))
    SUGGESTED="${LATEST_TAG%.*}.${NEXT_PATCH}"
else
    SUGGESTED=""
fi

print ""
read NEW_TAG\?"New release tag (eg. ${SUGGESTED}): "
[[ -z "$NEW_TAG" && -n "$SUGGESTED" ]] && NEW_TAG="$SUGGESTED" && print "Using ${NEW_TAG}"

if [[ -z "$NEW_TAG" ]]; then
    print "Aborted — no tag entered."
    ${GIT} checkout dev
    exit 0
fi

# If the tag already exists, offer to delete and recreate it
if ${GIT} rev-parse "$NEW_TAG" > /dev/null 2>&1; then
    read -k1 YN\?"Tag '${NEW_TAG}' already exists. Delete and recreate? [y/N]: "
    print ""
    if [[ "$YN" == "y" || "$YN" == "Y" ]]; then
        ${GIT} tag -d "${NEW_TAG}" || { print "ERROR: could not delete tag"; ${GIT} checkout dev; exit 1; }
    else
        print "Aborted."
        ${GIT} checkout dev
        exit 0
    fi
fi

# ── 4. Signed tag ────────────────────────────────────────────────────────────
print "\nCreating signed tag ${NEW_TAG} ..."
${GIT} tag -s "${NEW_TAG}" -m "Release ${NEW_TAG}" || {
    print "ERROR: git tag failed (smartcard PIN or passphrase needed for the tag signature?)"
    ${GIT} checkout dev
    exit 1
}

# ── 5. Production deploy ─────────────────────────────────────────────────────
print "\n── Running yarn deploy (production) ────────────────────────────────────"
print "   At the prompts: select [p], type 'yes', enter tag: ${NEW_TAG}\n"
yarn deploy
DEPLOY_STATUS=$?
if [[ ${DEPLOY_STATUS} -ne 0 ]]; then
    print "\nERROR: deploy script exited with status ${DEPLOY_STATUS}"
    print "The tag ${NEW_TAG} exists locally but nothing has been pushed. To recover:"
    print "  git push origin master && git push --tags     (if the deploy did publish)"
    print "  git tag -d ${NEW_TAG}                         (if it did not, and retry)"
    exit ${DEPLOY_STATUS}
fi

# ── 6. The signed archive must exist ────────────────────────────────────────
RELEASE_DIR="./release"
RELEASE_TGZ="${RELEASE_DIR}/hexmob.win-${NEW_TAG}-build.tgz"
RELEASE_SIG="${RELEASE_TGZ}.sig"

if [[ ! -f "$RELEASE_TGZ" ]]; then
    print "\nERROR: ${RELEASE_TGZ} not found — cannot publish a release without it."
    exit 1
fi
if [[ ! -f "$RELEASE_SIG" ]]; then
    print "\nERROR: ${RELEASE_SIG} not found."
    print "The archive is unsigned, and a release whose signature is missing is pointless."
    print "Sign it in a terminal that can prompt for the key, then re-run from step 6:"
    print "  gpg --yes -b ${RELEASE_TGZ}"
    exit 1
fi

# ── 7. Push ─────────────────────────────────────────────────────────────────
# Before touching releases: gh release operations address tags that must exist on the remote.
print "\nPushing master and tags to origin ..."
${GIT} push origin master || { print "ERROR: git push origin master failed"; exit 1; }
${GIT} push --tags        || { print "ERROR: git push --tags failed"; exit 1; }

# ── 8. Which release? ───────────────────────────────────────────────────────
# Default to the latest *published* release: a leftover draft from an abandoned attempt is
# not what the build currently being served belongs to. Drafts are shown separately.
CURRENT_RELEASE=$(${GH} release list --exclude-drafts --limit 1 --json tagName -q '.[0].tagName' 2>/dev/null)
DRAFT_COUNT=$(${GH} release list --json isDraft -q '[.[] | select(.isDraft)] | length' 2>/dev/null)

print "\nGitHub releases (published):"
${GH} release list --exclude-drafts --limit 5 2>/dev/null | sed 's/^/  /' || print "  (none found)"
[[ "${DRAFT_COUNT:-0}" != "0" ]] && print "  note: ${DRAFT_COUNT} draft release(s) exist and are NOT considered the current release"

if [[ -n "${CURRENT_RELEASE}" ]]; then
    print "\nDefault target: the current release '${CURRENT_RELEASE}'"
    print "  - it will be moved onto tag ${NEW_TAG}, its previous build assets replaced,"
    print "    and a line appended to its Changes notes."
    read -k1 TARGET_CHOICE\?"Publish to '${CURRENT_RELEASE}'? [Y] or create a NEW release [n]: "
    print ""
else
    print "\nNo existing release found — one will be created."
    TARGET_CHOICE="n"
fi

NOTES_TMP=$(mktemp "${TMPDIR:-/tmp}/release-notes.XXXXXX") || exit 1
trap "rm -f '${NOTES_TMP}'" EXIT

if [[ "${TARGET_CHOICE}" == "n" || "${TARGET_CHOICE}" == "N" ]]; then
    # New milestone release: seed notes from the commits since the previous tag.
    print "\nRelease title (Enter for '${NEW_TAG}'): "
    read RELEASE_TITLE
    [[ -z "${RELEASE_TITLE}" ]] && RELEASE_TITLE="${NEW_TAG}"

    PREV_TAG=$(${GIT} tag --sort=-v:refname | grep -v "^${NEW_TAG}$" | head -1)
    if [[ -n "${PREV_TAG}" ]]; then
        {
            print "Changes since ${PREV_TAG}:\n"
            ${GIT} log "${PREV_TAG}..${NEW_TAG}" --pretty='- %s' 
        } > "${NOTES_TMP}"
        print "\nSeeded notes from ${PREV_TAG}..${NEW_TAG}. Append anything else, then Ctrl-D:\n"
        ${GIT} log "${PREV_TAG}..${NEW_TAG}" --pretty='- %s' | sed 's/^/  /'
        print ""
    fi
    print "(Optional extra notes — blank line then Ctrl-D to finish)"
    EXTRA_NOTES=$(cat)
    [[ -n "${EXTRA_NOTES}" ]] && print "${EXTRA_NOTES}" >> "${NOTES_TMP}"

    ${GH} release create "${NEW_TAG}" "${RELEASE_TGZ}" "${RELEASE_SIG}" \
        --draft --title "${RELEASE_TITLE}" --notes-file "${NOTES_TMP}" \
        && print "\nDraft release created. Review and publish at: $(${GH} release view "${NEW_TAG}" --json url -q .url)" \
        || print "\nWARNING: gh release create failed — artifacts are in ${RELEASE_DIR}, create the release manually."
    ${GIT} checkout dev 2>/dev/null
    print "\nAll done."
    exit 0
fi

# Existing release, the usual path: move it to the new tag, replace the build, append notes.
print "\nMoving release '${CURRENT_RELEASE}' onto tag ${NEW_TAG} ..."
${GH} release edit "${CURRENT_RELEASE}" --tag "${NEW_TAG}" --verify-tag \
    || { print "ERROR: could not retag the release (is ${NEW_TAG} pushed?). Nothing else was changed."; exit 1; }

print "Replacing the previous build assets ..."
for ASSET in $(${GH} release view "${NEW_TAG}" --json assets -q '.assets[].name' 2>/dev/null); do
    print "  removing ${ASSET}"
    ${GH} release delete-asset "${NEW_TAG}" "${ASSET}" --yes > /dev/null \
        || print "  WARNING: could not remove ${ASSET}"
done
${GH} release upload "${NEW_TAG}" "${RELEASE_TGZ}" "${RELEASE_SIG}" --clobber \
    || { print "ERROR: upload failed — artifacts are in ${RELEASE_DIR}"; exit 1; }

print "Appending to the release notes ..."
${GH} release view "${NEW_TAG}" --json body -q .body > "${NOTES_TMP}" 2>/dev/null
{
    print ""
    read CHANGE_LINE\?"One line for the Changes notes (eg. 'Fixed read-only HEX balance header'): "
    print "- ${NEW_TAG} — ${CHANGE_LINE}"
} >> "${NOTES_TMP}"
${GH} release edit "${NEW_TAG}" --notes-file "${NOTES_TMP}" \
    || print "WARNING: could not update the notes — the release body is unchanged."

${GIT} checkout dev 2>/dev/null

print "\nAll done. Release: $(${GH} release view "${NEW_TAG}" --json url -q .url 2>/dev/null)"
print "Branch: $(${GIT} rev-parse --abbrev-ref HEAD)"
