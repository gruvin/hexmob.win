#!/bin/zsh
# scripts/release.sh — guided production release for hexmob.win
# Steps: merge dev→master, tag (signed), deploy, push, create GitHub release draft.

GIT=$(command -v git)
GH=$(command -v gh)

if [[ ! ( -f ./index.html && -d ./src ) ]]; then
    print "ERROR: run from project root"
    exit 1
fi

if [[ -z "$GH" ]]; then
    print "ERROR: gh CLI not found — install with: brew install gh"
    exit 1
fi

# ── 1. Ensure we're starting on dev ──────────────────────────────────────────
CURRENT_BRANCH=$(${GIT} rev-parse --abbrev-ref HEAD)
if [[ "$CURRENT_BRANCH" != "dev" ]]; then
    print "ERROR: expected to be on dev branch, currently on '${CURRENT_BRANCH}'"
    exit 1
fi

# ── 2. Merge dev into master ──────────────────────────────────────────────────
print "\nMerging dev → master ..."
${GIT} checkout master || { print "ERROR: checkout master failed"; exit 1 }
${GIT} merge dev       || { print "ERROR: merge dev failed"; ${GIT} checkout dev; exit 1 }

# ── 3. Show recent tags so you can pick the next version ─────────────────────
print "\nRecent tags (newest first):"
${GIT} tag --sort=-v:refname | head -10 | sed 's/^/  /'

# ── 4. Prompt for new tag, suggesting next patch version ─────────────────────
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

# If tag already exists, offer to delete and recreate it
if ${GIT} rev-parse "$NEW_TAG" > /dev/null 2>&1; then
    read -k1 YN\?"Tag '${NEW_TAG}' already exists. Delete and recreate? [y/N]: "
    print ""
    if [[ "$YN" == "y" || "$YN" == "Y" ]]; then
        ${GIT} tag -d "${NEW_TAG}" || { print "ERROR: could not delete tag"; ${GIT} checkout dev; exit 1 }
    else
        print "Aborted."
        ${GIT} checkout dev
        exit 0
    fi
fi

# ── 5. Create signed tag ──────────────────────────────────────────────────────
print "\nCreating signed tag ${NEW_TAG} ..."
${GIT} tag -s "${NEW_TAG}" -m "Release ${NEW_TAG}" || {
    print "ERROR: git tag failed"
    ${GIT} checkout dev
    exit 1
}

# ── 6. Run deploy script (production) ────────────────────────────────────────
print "\n── Running yarn deploy (production) ────────────────────────────────────"
print "   At the prompts: select [p], type 'yes', enter tag: ${NEW_TAG}\n"
yarn deploy

DEPLOY_STATUS=$?
if [[ $DEPLOY_STATUS -ne 0 ]]; then
    print "\nERROR: deploy script exited with status ${DEPLOY_STATUS}"
    print "Resolve the issue, then run the remaining steps manually:"
    print "  git push origin master && git push --tags"
    print "  gh release create ${NEW_TAG} ..."
    exit $DEPLOY_STATUS
fi

# ── 7. Verify release files exist ────────────────────────────────────────────
RELEASE_DIR="./release"
RELEASE_TGZ="${RELEASE_DIR}/hexmob.win-${NEW_TAG}-build.tgz"
RELEASE_SIG="${RELEASE_TGZ}.sig"

if [[ ! -f "$RELEASE_SIG" ]]; then
    print "\nWARNING: ${RELEASE_SIG} not found — deploy.sh signing may have failed."
    print "Run manually: gpg --yes -b ${RELEASE_TGZ}"
    read -k1 \?"Press any key to continue anyway, Ctrl-C to abort ..."
    print ""
fi

# ── 8. Push to origin ─────────────────────────────────────────────────────────
print "\nPushing master and tags to origin ..."
${GIT} push origin master || { print "ERROR: git push origin master failed"; exit 1 }
${GIT} push --tags        || { print "ERROR: git push --tags failed"; exit 1 }

# ── 9. Draft GitHub release with files attached ───────────────────────────────
print "\nCreating GitHub release draft for ${NEW_TAG} ..."

PREV_TAG=$(${GIT} tag --sort=-v:refname | grep -v "^${NEW_TAG}$" | head -1)
if [[ -n "$PREV_TAG" ]]; then
    print "\nCommits since ${PREV_TAG}:"
    ${GIT} log "${PREV_TAG}..${NEW_TAG}" --oneline | sed 's/^/  /'
    print ""
fi

read RELEASE_TITLE\?"Release title (Enter to use tag: ${NEW_TAG}): "
[[ -z "$RELEASE_TITLE" ]] && RELEASE_TITLE="${NEW_TAG}"

print "(Enter release notes — blank line then Ctrl-D to finish, or just Ctrl-D for none)"
RELEASE_NOTES=$(cat)

${GH} release create "${NEW_TAG}" \
    "${RELEASE_TGZ}" \
    "${RELEASE_SIG}" \
    --draft \
    --title "${RELEASE_TITLE}" \
    --notes "${RELEASE_NOTES}" \
    && print "\nDraft release created. Review and publish at: $(${GH} release view ${NEW_TAG} --json url -q .url)" \
    || print "\nWARNING: gh release create failed — files are in ${RELEASE_DIR}, create release manually."

# ── 10. Ensure we're back on dev ─────────────────────────────────────────────
FINAL_BRANCH=$(${GIT} rev-parse --abbrev-ref HEAD)
if [[ "$FINAL_BRANCH" != "dev" ]]; then
    print "\nReturning to dev branch ..."
    ${GIT} checkout dev
fi

print "\nAll done. Branch: $(${GIT} rev-parse --abbrev-ref HEAD)"
