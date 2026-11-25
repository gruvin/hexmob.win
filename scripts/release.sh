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
#   6. choose the target release, then edit its notes in $EDITOR (with the current body
#      pre-loaded, like `git commit` does) - all before anything is pushed
#   7. push master + tags
#   8. put the build on GitHub: retag the current release onto the new tag and replace its
#      assets, or create a new draft release for a milestone
#
# Background worth knowing (AGENTS.md §5): tags are per build, and the release is a moving
# pointer that always carries the build currently served. Releases exist so the signed source
# can be checked against what a browser actually runs, not as a distribution channel. The
# conventional "one release per version with regenerated notes" model does not apply here.

GIT=$(command -v git)
GH=$(command -v gh)

# ── Dry run ─────────────────────────────────────────────────────────────────
# `yarn release --dry-run` (or DRY_RUN=1) exercises every prompt and prints the commands it
# would run, without merging, tagging, deploying, pushing or touching any GitHub release.
# Read-only steps still run for real, so the release list and the notes body in $EDITOR are
# the live ones - that is the point of rehearsing it.
DRY_RUN=${DRY_RUN:-0}
REPUBLISH=${REPUBLISH:-0}
for ARG in "$@"; do
    case "$ARG" in
        (--dry-run|--dryrun|-n) DRY_RUN=1 ;;
        (--republish) REPUBLISH=1 ;;
        (*) print "ERROR: unknown argument '${ARG}' (only --dry-run is understood)"; exit 1 ;;
    esac
done

# @args: command...
# Runs it, or prints it. Only for simple commands - pipelines and redirections stay inline.
_run() {
    if [[ ${DRY_RUN} -eq 1 ]]; then
        print -r -- "  [dry-run] ${(j: :)${(q)@}}"
        return 0
    fi
    "$@"
}

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

if [[ ${DRY_RUN} -eq 1 ]]; then
    print "\n=== DRY RUN: nothing will be merged, tagged, deployed, pushed or published ==="
fi

# ── 2. Merge dev into master ─────────────────────────────────────────────────
print "\nMerging dev → master ..."
_run ${GIT} checkout master || { print "ERROR: checkout master failed"; exit 1 }
_run ${GIT} merge dev       || { print "ERROR: merge dev failed"; _run ${GIT} checkout dev; exit 1 }

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

# ── 3b. Tag state ────────────────────────────────────────────────────────────
# Three states, three behaviours. The tag is created before the deploy and pushed after the
# release steps, so a failed run normally leaves a tag that nobody else can see - retrying with
# the same tag is finishing an interrupted job, not rewriting history.
#   no local tag                 -> create and sign it
#   local, not on origin         -> reuse it (it is already signed; re-signing churns the object)
#   local, on origin, no release -> resume: the tag is public, nothing was published yet
#   local, on origin, released   -> only with --republish: it would replace published assets
_remote_tag_state() { # absent | present | unknown
    local OUT RC
    OUT=$(${GIT} ls-remote --tags origin "refs/tags/$1" 2>/dev/null)
    RC=$?
    [[ ${RC} -ne 0 ]] && { print -n unknown; return; }
    [[ -n "${OUT}" ]] && { print -n present; return; }
    print -n absent
}

TAG_MODE=create
if ${GIT} rev-parse --verify --quiet "refs/tags/${NEW_TAG}" > /dev/null; then
    if [[ "$(${GIT} cat-file -t "refs/tags/${NEW_TAG}" 2>/dev/null)" != "tag" ]]; then
        print "\nWARNING: ${NEW_TAG} exists but is not an annotated (signed) tag - recreating it."
        _run ${GIT} tag -d "${NEW_TAG}" > /dev/null || { print "ERROR: could not delete ${NEW_TAG}"; exit 1; }
    else
        REMOTE_STATE=$(_remote_tag_state "${NEW_TAG}")
        case "${REMOTE_STATE}" in
            (absent)
                TAG_MODE=reuse
                print "\nTag ${NEW_TAG} exists locally and is not on origin - reusing it (nothing is rewritten)."
                print "  summary: $(${GIT} for-each-ref --format='%(contents:subject)' "refs/tags/${NEW_TAG}")"
                ;;
            (present)
                if ${GH} release view "${NEW_TAG}" > /dev/null 2>&1; then
                    if [[ ${REPUBLISH} -eq 0 ]]; then
                        print "\nERROR: ${NEW_TAG} is pushed AND already has a release."
                        print "Continuing would rebuild, redeploy and REPLACE that release's published assets."
                        print "  - to do that deliberately:  yarn release --republish"
                        print "  - otherwise pick the next patch tag - a new tag says why the build changed."
                        exit 1
                    fi
                    TAG_MODE=republish
                    print "\n--republish: ${NEW_TAG} is released; its assets will be replaced."
                else
                    TAG_MODE=resume
                    print "\nTag ${NEW_TAG} is pushed but has no release yet - resuming the release for it."
                fi
                ;;
            (*)
                print "\nERROR: cannot tell whether ${NEW_TAG} is on origin (git ls-remote failed)."
                print "Refusing to recreate a tag that might already be public."
                exit 1
                ;;
        esac
    fi
fi

# ── 4. Signed tag ────────────────────────────────────────────────────────────
# The tag annotation is the human record *inside* the signed object (`git show <tag>`), and
# every release tag in this repo carries a one-line summary. It is not the same thing as the
# release notes: this says what the build is, the notes accumulate on the GitHub release.
if [[ "${TAG_MODE}" == "create" ]]; then
    print ""
    read TAG_SUMMARY\?"One-line summary for the tag (eg. 'Fixed penalty calcs for stakes including BPD'): "
    if [[ -z "${TAG_SUMMARY//[[:space:]]/}" ]]; then
        print "\nERROR: a one-line summary is required — it is the description inside the signed tag."
        print "Nothing has been merged, tagged, deployed or pushed."
        _run ${GIT} checkout dev 2>/dev/null
        exit 1
    fi

    print "\nCreating signed tag ${NEW_TAG} ..."
    print "  summary: ${TAG_SUMMARY}"
    _run ${GIT} tag -s "${NEW_TAG}" -m "${TAG_SUMMARY}" || {
        print "ERROR: git tag failed (smartcard PIN or passphrase needed for the tag signature?)"
        _run ${GIT} checkout dev
        exit 1
    }
else
    print "\nTag ${NEW_TAG} already exists (${TAG_MODE}) - not re-creating it."
fi

# ── 5. Production deploy ─────────────────────────────────────────────────────
# A release exists only to publish a tag, so the deploy's "production or dev?" and typed-yes
# prompts are answered here rather than asked again. The deploy's remaining gate - build this
# tag and deploy it to both hosts, yes/no - is left in place: it is the point of no return.
print "\n── Production deploy of ${NEW_TAG} ────────────────────────────────────\n"
print "   (deploy.sh does the build/publish; this script owns the tag, the push and the release)\n"
if [[ ${DRY_RUN} -eq 1 ]]; then
    print "  [dry-run] DEPLOY_KIND=p DEPLOY_CONFIRM=yes DEPLOY_TAG=${NEW_TAG} ./scripts/deploy.sh"
    print "  [dry-run] (production deploy skipped - no hosts touched, no archive produced)"
    DEPLOY_STATUS=0
else
    DEPLOY_KIND=p DEPLOY_CONFIRM=yes DEPLOY_TAG="${NEW_TAG}" ./scripts/deploy.sh
    DEPLOY_STATUS=$?
fi
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

if [[ ${DRY_RUN} -eq 1 ]]; then
    print "\n(dry-run: skipping the archive/signature check - the deploy that produces them was skipped)"
elif [[ ! -f "$RELEASE_TGZ" ]]; then
    print "\nERROR: ${RELEASE_TGZ} not found — cannot publish a release without it."
    exit 1
fi
if [[ ${DRY_RUN} -eq 0 && ! -f "$RELEASE_SIG" ]]; then
    print "\nERROR: ${RELEASE_SIG} not found."
    print "The archive is unsigned, and a release whose signature is missing is pointless."
    print "Sign it in a terminal that can prompt for the key, then re-run from step 6:"
    print "  gpg --yes -b ${RELEASE_TGZ}"
    exit 1
fi

# ── Notes editing ───────────────────────────────────────────────────────────────────────────
# Presents the notes in $EDITOR, the way `git commit` does: a comment header, a marker line,
# and the existing text beneath it. Everything above the marker is instructions and is
# discarded, so markdown headings in the notes themselves survive untouched (which is why this
# does not simply strip lines starting with '#').
NOTES_MARKER='<!-- ===== notes below this line; text above it is ignored ===== -->'

# @args: TMPFILE (pre-populated with the current notes), TITLE, [REFERENCE_FILE]
_edit_notes() {
    local FILE=$1
    local TITLE=$2
    local REF=${3:-}
    local EDITOR_BIN=${EDITOR:-vi}
    local STAGED="${FILE}.edit"

    {
        print -r -- "# Release notes for ${NEW_TAG} (${TITLE})"
        print -r -- "#"
        print -r -- "# Edit below the marker. Save and quit to continue the release;"
        print -r -- "# quit without saving to abort — nothing has been pushed yet."
        print -r -- "# Set EDITOR to control the editor (eg. EDITOR='code --wait')."
        if [[ -n "${REF}" && -s "${REF}" ]]; then
            print -r -- "#"
            print -r -- "# For reference only (not published) — candidates for the notes:"
            sed 's/^/#   /' "${REF}"
        fi
        print -r -- "${NOTES_MARKER}"
        # Strip CRs: release bodies authored elsewhere can be CRLF, and nvim then renders every
        # line ending as ^M. Line endings are normalised on the way in and on the way out.
        tr -d '\r' < "${FILE}"
    } > "${STAGED}"

    # ${=VAR} word-splits, so EDITOR can carry arguments ("code --wait").
    ${=EDITOR_BIN} "${STAGED}" || { print "\nERROR: editor exited non-zero — aborted, nothing pushed."; return 1; }

    # Keep everything after the marker, drop trailing blank lines.
    local BODY
    BODY=$(sed "1,/$(print -r -- "${NOTES_MARKER}" | sed 's/[][\.*^$/]/\\&/g')/d" "${STAGED}")
    BODY=$(print -r -- "${BODY}" | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}')
    rm -f "${STAGED}"

    if [[ -z "${BODY//[[:space:]]/}" ]]; then
        print "\nERROR: the notes came back empty — refusing to publish a release with no notes."
        return 1
    fi
    print -r -- "${BODY}" | tr -d '\r' > "${FILE}"
    return 0
}

# ── 7. Which release? (read-only, before anything is pushed) ─────────────────
# Default to the latest *published* release: a leftover draft from an abandoned attempt is
# not what the build currently being served belongs to. Drafts are shown separately.
# Identify releases by title as well as tag - these releases carry descriptive names
# ("3rd Party Security Upgrades"), so the tag alone is ambiguous to a human reader.
CURRENT_RELEASE=$(${GH} release list --exclude-drafts --limit 1 --json tagName -q '.[0].tagName' 2>/dev/null)
CURRENT_RELEASE_NAME=$(${GH} release list --exclude-drafts --limit 1 --json name -q '.[0].name' 2>/dev/null)
DRAFT_COUNT=$(${GH} release list --json isDraft -q '[.[] | select(.isDraft)] | length' 2>/dev/null)
[[ -z "${CURRENT_RELEASE_NAME}" ]] && CURRENT_RELEASE_NAME="${CURRENT_RELEASE}"

# Format the list ourselves. gh only aligns columns when stdout is a terminal, so piping it
# (as any script must) yields raw tabs and the columns come out ragged in the operator's
# terminal. Also use publishedAt, which is the PUBLISHED column gh shows - createdAt is when
# the release object was made and differs for releases that were edited later.
print "\nGitHub releases (published):"
RELEASE_ROWS=$(${GH} release list --exclude-drafts --limit 5 \
    --json tagName,name,publishedAt,isLatest \
    -q '.[] | [.tagName, (.publishedAt[:10]), (if ((.name // "") == "") then .tagName else .name end), (if .isLatest then "[latest]" else "" end)] | @tsv' 2>/dev/null)
if [[ -n "${RELEASE_ROWS}" ]]; then
    print -r -- "${RELEASE_ROWS}" | while IFS=$'\t' read -r R_TAG R_DATE R_TITLE R_MARK; do
        (( ${#R_TITLE} > 54 )) && R_TITLE="${R_TITLE[1,51]}..."
        printf '  %-7s  %s  %-54s %s\n' "${R_TAG}" "${R_DATE}" "${R_TITLE}" "${R_MARK}"
    done
else
    print "  (none found)"
fi
[[ "${DRAFT_COUNT:-0}" != "0" ]] && print "  note: ${DRAFT_COUNT} draft release(s) exist and are NOT considered the current release"

if [[ -n "${CURRENT_RELEASE}" ]]; then
    # Default from the version bump: MAJOR.MINOR.PATCH -> same MAJOR.MINOR with a higher patch
    # continues the current release; a minor or major bump starts a new one. Unparseable tags
    # (TS1, say) fall back to the usual case, update.
    PUBLISH_DEFAULT=u
    if [[ "${CURRENT_RELEASE}" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
        CUR_MAJ=${match[1]}
        CUR_MIN=${match[2]}
        if [[ "${NEW_TAG}" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
            [[ "${match[1]}" != "${CUR_MAJ}" || "${match[2]}" != "${CUR_MIN}" ]] && PUBLISH_DEFAULT=n
        fi
    fi

    print "\nHow should ${NEW_TAG} be published?"
    print "  [u] update current release (${CURRENT_RELEASE}) → retag to ${NEW_TAG}, replace source+sig files, edit notes"
    print "  [n] new release ${NEW_TAG} → open release notes editor"
    read -k1 TARGET_CHOICE\?"Choice [u/n] (Enter = ${PUBLISH_DEFAULT}): "
    print ""
    [[ -z "${TARGET_CHOICE}" || "${TARGET_CHOICE}" == $'\n' ]] && TARGET_CHOICE="${PUBLISH_DEFAULT}"
else
    print "\nNo existing release found — one will be created for ${NEW_TAG}."
    TARGET_CHOICE="n"
fi

# ── 8. Notes, before anything leaves this machine ───────────────────────────
# Deliberately before the push: the notes are the last thing that needs a human, and asking
# for them after the assets were already replaced would leave a half-described release behind
# if the operator changed their mind.
NOTES_TMP=$(mktemp "${TMPDIR:-/tmp}/release-notes.XXXXXX") || exit 1
trap "rm -f '${NOTES_TMP}' '${NOTES_TMP}.edit'" EXIT

NOTES_CHANGED=0
if [[ "${TARGET_CHOICE}" == "n" || "${TARGET_CHOICE}" == "N" ]]; then
    print "\nTitle for the new release (Enter for '${NEW_TAG}'): "
    read RELEASE_TITLE
    [[ -z "${RELEASE_TITLE}" ]] && RELEASE_TITLE="${NEW_TAG}"

    # Seed from the commits since the previous tag; the editor is where it gets shaped.
    # Prefer a version-shaped tag (a stray TS1 would otherwise sort above 0.4.26 and produce a
    # range spanning the whole history), and in a dry run the new tag does not exist yet, so
    # fall back to HEAD as the range end.
    PREV_TAG=$(${GIT} tag --sort=-v:refname | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' | grep -v "^${NEW_TAG}$" | head -1)
    [[ -z "${PREV_TAG}" ]] && PREV_TAG=$(${GIT} tag --sort=-v:refname | grep -v "^${NEW_TAG}$" | head -1)
    RANGE_END="${NEW_TAG}"
    ${GIT} rev-parse --verify --quiet "refs/tags/${NEW_TAG}" > /dev/null || RANGE_END="HEAD"
    # The commits go to the editor as *reference*, above the marker, rather than into the
    # published body: a milestone note should say what it means, not replay `git log`.
    REF_TMP="${NOTES_TMP}.ref"
    if [[ -n "${PREV_TAG}" ]]; then
        print "\nCommits since ${PREV_TAG} (shown in the editor for reference):"
        ${GIT} log "${PREV_TAG}..${RANGE_END}" --pretty='- %s' | sed 's/^/  /'
        ${GIT} log "${PREV_TAG}..${RANGE_END}" --pretty='- %s' > "${REF_TMP}"
        printf '## Changes\n\n' > "${NOTES_TMP}"
    else
        : > "${REF_TMP}"
        printf '## Changes\n\n' > "${NOTES_TMP}"
    fi
    _edit_notes "${NOTES_TMP}" "${RELEASE_TITLE}" "${REF_TMP}" || exit 1
    rm -f "${REF_TMP}"
else
    # The usual path: pull the current body so the edit is an append, not a replacement.
    ${GH} release view "${CURRENT_RELEASE}" --json body -q .body 2>/dev/null | tr -d '\r' > "${NOTES_TMP}"
    cp "${NOTES_TMP}" "${NOTES_TMP}.orig"
    _edit_notes "${NOTES_TMP}" "${CURRENT_RELEASE}" || exit 1
    cmp -s "${NOTES_TMP}" "${NOTES_TMP}.orig" || NOTES_CHANGED=1
    rm -f "${NOTES_TMP}.orig"
fi

# ── 9. Push ─────────────────────────────────────────────────────────────────
# Before touching releases: gh release operations address tags that must exist on the remote.
print "\nPushing master and tags to origin ..."
_run ${GIT} push origin master || { print "ERROR: git push origin master failed"; exit 1; }
_run ${GIT} push --tags        || { print "ERROR: git push --tags failed"; exit 1; }

# ── 10. Publish ─────────────────────────────────────────────────────────────
if [[ "${TARGET_CHOICE}" == "n" || "${TARGET_CHOICE}" == "N" ]]; then
    if [[ ${DRY_RUN} -eq 1 ]]; then
        print "  [dry-run] would create a DRAFT release '${NEW_TAG}' with the assets above"
    elif ${GH} release create "${NEW_TAG}" "${RELEASE_TGZ}" "${RELEASE_SIG}" \
        --draft --title "${RELEASE_TITLE}" --notes-file "${NOTES_TMP}"; then
        print "\nDraft release created. Review and publish at: $(${GH} release view "${NEW_TAG}" --json url -q .url)"
    else
        print "\nWARNING: gh release create failed — artifacts are in ${RELEASE_DIR}, create the release manually."
    fi
else
    print "\nMoving release '${CURRENT_RELEASE}' onto tag ${NEW_TAG} ..."
    _run ${GH} release edit "${CURRENT_RELEASE}" --tag "${NEW_TAG}" --verify-tag \
        || { print "ERROR: could not retag the release (is ${NEW_TAG} pushed?). Nothing else was changed."; exit 1; }

    print "Replacing the previous build assets ..."
    for ASSET in $(${GH} release view "${NEW_TAG}" --json assets -q '.assets[].name' 2>/dev/null); do
        if [[ ${DRY_RUN} -eq 1 ]]; then
            print "  [dry-run] would remove ${ASSET}"
        else
            print "  removing ${ASSET}"
            ${GH} release delete-asset "${NEW_TAG}" "${ASSET}" --yes > /dev/null \
                || print "  WARNING: could not remove ${ASSET}"
        fi
    done
    _run ${GH} release upload "${NEW_TAG}" "${RELEASE_TGZ}" "${RELEASE_SIG}" --clobber \
        || { print "ERROR: upload failed — artifacts are in ${RELEASE_DIR}"; exit 1; }

    if [[ ${NOTES_CHANGED} -eq 1 ]]; then
        _run ${GH} release edit "${NEW_TAG}" --notes-file "${NOTES_TMP}" \
            || print "WARNING: could not update the notes — the release body is unchanged."
    else
        print "Notes unchanged — leaving the release body alone."
    fi
fi

_run ${GIT} checkout dev 2>/dev/null

if [[ ${DRY_RUN} -eq 1 ]]; then
    print "\nDRY RUN complete — nothing was merged, tagged, deployed, pushed or published."
    print "\nThe notes that would have been published:"
    sed 's/^/  | /' "${NOTES_TMP}"
    exit 0
fi

print "\nAll done. Release: $(${GH} release view "${NEW_TAG}" --json url -q .url 2>/dev/null)"
print "Branch: $(${GIT} rev-parse --abbrev-ref HEAD)"
