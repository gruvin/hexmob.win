#!/bin/zsh
# scripts/release.sh — guided production release for hexmob.win
#
# One command for the whole ceremony, with the operator confirming at the two points that
# actually matter (the production deploy, and which GitHub release the build lands in):
#
#   1. require a clean tree on master (this script never merges or checks out - that is the
#      operator's job, done deliberately before a release)
#   2. warn if dev is ahead of master, so a release cannot silently omit work
#   3. derive the next version and create a SIGNED tag
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

# shellcheck source=scripts/ui.zsh
[[ -f "${0:A:h}/ui.zsh" ]] && . "${0:A:h}/ui.zsh"

# If the cosmetic library is missing, fall back to plain output rather than dying on undefined
# helpers: styling must never be able to break a deploy.
if [[ -z "${_UI_LOADED:-}" ]]; then
    C_RESET=''; C_BOLD=''; C_DIM=''; C_MUTE=''; C_HEAD=''; C_ACC=''; C_OK=''; C_WARN=''; C_ERR=''
    ui_stage() { print -r -- ""; print -r -- "  ◆ $1${2:+  $2}" }
    ui_head()  { print -r -- "$1" }
    ui_ok()    { print -r -- "  ✔ $1" }
    ui_warn()  { print -r -- "  ! $1" }
    ui_err()   { print -r -- "  ✖ $1" }
    ui_dim()   { print -r -- "  $1" }
    ui_kv()    { printf '  %-8s %s\n' "$1" "$2" }
fi

# Interactive by design. Without a terminal the `read -k1` prompts fail and leave their variables
# empty, which means "yes" to every confirmation - so refuse up front.
if [[ ! -t 0 ]]; then
    ui_err "this script is interactive by design and stdin is not a terminal"
    print "  Run it from an interactive shell (it asks for the tag, the notes and confirmations)."
    exit 1
fi


ORIG_PWD="$PWD"   # the script refuses to run outside the project root, so this is the repo
# Where the two brands are actually served from - the deploy targets are FTP paths, these are how
# an end user reaches them, which is what a release has to match.
URL_HEXMOB="https://hexmob.win"
URL_TSA="https://go.tshare.app"
GIT=$(command -v git)
GH=$(command -v gh)
GPG=$(command -v gpg)

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

# @args: BASE_URL
# Prints the tag the host reports in its deploy marker, or nothing if it cannot be read. The
# marker is named .php so PHP-FPM serves it fresh rather than the host's static cache, and the
# query string defeats any intermediate cache in front of it.
_live_tag() {
    local OUT
    OUT=$(curl -fsS --max-time 8 "${1}/deploy.php?t=$(date +%s)" 2>/dev/null) || return 1
    print -r -- "${OUT}" | sed -n 's/.*"tag"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p'
}

# @args: TAG
# Confirms both brands are serving TAG right now. Sets LIVE_HEXMOB / LIVE_TSA, and returns 0 only
# when both agree - an archive on disk proves a publish once returned 0, not that the hosts still
# serve that build.
_verify_live() {
    local WANT=$1
    ui_spin "asking ${URL_HEXMOB} what it serves" _live_tag "${URL_HEXMOB}"
    LIVE_HEXMOB=${UI_SPIN_OUT}
    ui_spin "asking ${URL_TSA} what it serves" _live_tag "${URL_TSA}"
    LIVE_TSA=${UI_SPIN_OUT}
    [[ "${LIVE_HEXMOB}" == "${WANT}" && "${LIVE_TSA}" == "${WANT}" ]]
}

# @args: TGZ path
# Signs the release archive and verifies the signature it produced. --batch is deliberate:
# unattended signing works for a passphrase-less key, and a key that needs a prompt or a card PIN
# must fail fast rather than block the release behind pinentry. On failure the command is copied
# to the clipboard so it can be run in a terminal that can prompt.
#
# Signing lives here, not in deploy.sh: deploy builds and publishes, this script owns the tag,
# the signature, the push and the release. That split is what allows a retry to sign an archive
# a previous attempt already built, without rebuilding or redeploying anything.
_sign_release() {
    local TGZ=$1
    local SIG="${TGZ}.sig"
    if [[ -z "${TGZ}" ]]; then
        ui_err "signing called without an archive path - the archive is UNSIGNED"
        return 1
    fi
    if [[ -z "${GPG}" ]] || [[ ! -x "${GPG}" ]]; then
        ui_err "gpg not found - the archive is UNSIGNED"
        return 1
    fi
    ui_stage "Signing the release archive"
    if ${GPG} --batch --yes -b "${TGZ}"; then
        if ${GPG} --verify "${SIG}" "${TGZ}" > /dev/null 2>&1; then
            ui_ok "signed and verified: ${SIG}"
            return 0
        fi
        ui_warn "signature written but verification failed: ${SIG}"
        return 1
    fi
    ui_err "signing failed - the archive is UNSIGNED"
    ui_dim "if the signing key needs a passphrase or a card PIN, run this in a terminal:"
    ui_dim "    gpg --yes -b \"${TGZ}\""
    echo -n "gpg --yes -b ${TGZ}" | pbcopy 2>/dev/null && ui_dim "(command copied to clipboard)"
    return 1
}

# ── 1. Preconditions: on master, clean tree ──────────────────────────────────
CURRENT_BRANCH=$(${GIT} rev-parse --abbrev-ref HEAD)
if [[ "${CURRENT_BRANCH}" != "master" ]]; then
    ui_err "release must be run from master (currently on '${CURRENT_BRANCH}')"
    print "  This script does not merge or check out anything. Merge what you want released"
    print "  into master, check master out, then re-run:"
    print ""
    ui_dim "git checkout master && git merge dev"
    exit 1
fi
if [[ -n "$(${GIT} status --porcelain --untracked-files=normal)" ]]; then
    ui_err "working tree is not clean"
    ${GIT} status --short | sed 's/^/  /'
    exit 1
fi

if [[ ${DRY_RUN} -eq 1 ]]; then
    print "\n=== DRY RUN: nothing will be tagged, deployed, pushed or published ==="
fi

# ── 2. Sanity: does master have everything you think it does? ────────────────
# Not an error: releasing a curated master while dev runs ahead is a legitimate choice. But a
# release that quietly omits work is not, so say it out loud and carry on.
DEV_AHEAD=$(${GIT} rev-list --count master..dev 2>/dev/null || print 0)
if [[ "${DEV_AHEAD:-0}" -gt 0 ]]; then
    ui_warn "local dev is ${DEV_AHEAD} commit(s) ahead of master - this release contains only what is on master"
    ${GIT} log --oneline master..dev | head -5 | sed 's/^/    /'
    [[ ${DEV_AHEAD} -gt 5 ]] && ui_dim "  … and $(( DEV_AHEAD - 5 )) more"
    # Not a block: releasing a curated master is a legitimate choice. But it must be a choice,
    # not a default nobody noticed.
    read -k1 YN\?"Proceed anyway? [Yn] "
    print ""
    case "${YN}" in
        (n|N) print "Aborted — nothing has been tagged, deployed or pushed." ; exit 0 ;;
    esac
fi

_remote_tag_state() { # absent | present | unknown
    local OUT RC
    ui_spin "checking origin for tag $1" ${GIT} ls-remote --tags origin "refs/tags/$1"
    OUT=${UI_SPIN_OUT}
    RC=$?
    [[ ${RC} -ne 0 ]] && { print -n unknown; return; }
    [[ -n "${OUT}" ]] && { print -n present; return; }
    print -n absent
}

# ── 2b. Gather the remote state, before asking anything ──────────────────────
# Every read-only call happens here, ahead of the prompts: otherwise the operator is asked for a
# tag while the console is still churning out release lists and spinners, and the information
# arrives too late to inform the decision.
# Default to the latest *published* release: a leftover draft from an abandoned attempt is
# not what the build currently being served belongs to. Drafts are shown separately.
# Identify releases by title as well as tag - these releases carry descriptive names
# ("3rd Party Security Upgrades"), so the tag alone is ambiguous to a human reader.
ui_spin "reading the release list" ${GH} release list --exclude-drafts --limit 1 \
    --json tagName,name -q '.[0] | "\(.tagName)\t\(.name)"'
CURRENT_RELEASE=${UI_SPIN_OUT%%$'\t'*}
CURRENT_RELEASE_NAME=${UI_SPIN_OUT#*$'\t'}
ui_spin "counting drafts" ${GH} release list --json isDraft -q '[.[] | select(.isDraft)] | length'
DRAFT_COUNT=${UI_SPIN_OUT}
[[ -z "${CURRENT_RELEASE_NAME}" ]] && CURRENT_RELEASE_NAME="${CURRENT_RELEASE}"

# Format the list ourselves. gh only aligns columns when stdout is a terminal, so piping it
# (as any script must) yields raw tabs and the columns come out ragged in the operator's
# terminal. Also use publishedAt, which is the PUBLISHED column gh shows - createdAt is when
# the release object was made and differs for releases that were edited later.
ui_head "GitHub releases (published):"
ui_spin "reading releases" ${GH} release list --exclude-drafts --limit 5 \
    --json tagName,name,publishedAt,isLatest \
    -q '.[] | [.tagName, (.publishedAt[:10]), (if ((.name // "") == "") then .tagName else .name end), (if .isLatest then "[latest]" else "" end)] | @tsv'
RELEASE_ROWS=${UI_SPIN_OUT}
if [[ -n "${RELEASE_ROWS}" ]]; then
    print -r -- "${RELEASE_ROWS}" | while IFS=$'\t' read -r R_TAG R_DATE R_TITLE R_MARK; do
        (( ${#R_TITLE} > 54 )) && R_TITLE="${R_TITLE[1,51]}..."
        printf '  %-7s  %s  %-54s %s\n' "${R_TAG}" "${R_DATE}" "${R_TITLE}" "${R_MARK}"
    done
else
    print "  (none found)"
fi
[[ "${DRAFT_COUNT:-0}" != "0" ]] && print "  note: ${DRAFT_COUNT} draft release(s) exist and are NOT considered the current release"

# ── 3. Pick the next version ─────────────────────────────────────────────────
ui_head "Recent tags (newest first)"
${GIT} tag --sort=-v:refname | head -10 | sed 's/^/  /'

# A tag that was never published is an *unfinished release*, not released history: stepping past
# it would leave it dangling (a local tag for a build nobody ever saw). So if the newest tag is
# local-only, or pushed but without a release, suggest that same tag again - the tag-state logic
# in 3b will then reuse or resume it rather than creating another.
LATEST_TAG=$(${GIT} tag --sort=-v:refname | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' | head -1)
SUGGESTED=""
if [[ -n "$LATEST_TAG" ]]; then
    LATEST_STATE=$(_remote_tag_state "${LATEST_TAG}")
    PROBED_TAG="${LATEST_TAG}"
    PROBED_STATE="${LATEST_STATE}"
    PROBED_HAS_RELEASE=0
    [[ "$LATEST_STATE" == "present" ]] && \
        ui_spin "looking for a release of ${LATEST_TAG}" ${GH} release view "${LATEST_TAG}" && PROBED_HAS_RELEASE=1
    if [[ "$LATEST_STATE" == "absent" ]]; then
        SUGGESTED="${LATEST_TAG}"
        ui_warn "${LATEST_TAG} exists locally but was never pushed - suggesting it again (unfinished release)"
    elif [[ "$LATEST_STATE" == "present" && ${PROBED_HAS_RELEASE} -eq 0 ]]; then
        SUGGESTED="${LATEST_TAG}"
        ui_warn "${LATEST_TAG} is pushed but has no release yet - suggesting it again (unfinished release)"
    else
        [[ "$LATEST_STATE" == "unknown" ]] && \
            ui_warn "could not tell whether ${LATEST_TAG} is published (git ls-remote failed)"
        NEXT_PATCH=$(( ${LATEST_TAG##*.} + 1 ))
        SUGGESTED="${LATEST_TAG%.*}.${NEXT_PATCH}"
    fi
fi

print ""
read NEW_TAG\?"Release tag [${SUGGESTED}]: "
[[ -z "$NEW_TAG" && -n "$SUGGESTED" ]] && NEW_TAG="$SUGGESTED" && print "Using ${NEW_TAG}"

if [[ -z "$NEW_TAG" ]]; then
    print "Aborted — no tag entered."
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

TAG_MODE=create
if ${GIT} rev-parse --verify --quiet "refs/tags/${NEW_TAG}" > /dev/null; then
    if [[ "$(${GIT} cat-file -t "refs/tags/${NEW_TAG}" 2>/dev/null)" != "tag" ]]; then
        print "\nWARNING: ${NEW_TAG} exists but is not an annotated (signed) tag - recreating it."
        _run ${GIT} tag -d "${NEW_TAG}" > /dev/null || { print "ERROR: could not delete ${NEW_TAG}"; exit 1; }
    else
        # If the operator accepted the suggested tag, its state is already known - do not make
        # them watch the console churn again right after typing.
        if [[ "${NEW_TAG}" == "${PROBED_TAG:-}" ]]; then
            REMOTE_STATE="${PROBED_STATE}"
            HAS_RELEASE=${PROBED_HAS_RELEASE}
        else
            REMOTE_STATE=$(_remote_tag_state "${NEW_TAG}")
            HAS_RELEASE=0
            [[ "${REMOTE_STATE}" == "present" ]] && \
                ui_spin "looking for a release of ${NEW_TAG}" ${GH} release view "${NEW_TAG}" && HAS_RELEASE=1
        fi
        case "${REMOTE_STATE}" in
            (absent)
                TAG_MODE=reuse
                print "\nTag ${NEW_TAG} exists locally and is not on origin - reusing it (nothing is rewritten)."
                print "  summary: $(${GIT} for-each-ref --format='%(contents:subject)' "refs/tags/${NEW_TAG}")"
                ;;
            (present)
                if [[ ${HAS_RELEASE} -eq 1 ]]; then
                    if [[ ${REPUBLISH} -eq 0 ]]; then
                        ui_err "${NEW_TAG} is pushed AND already has a release."
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
                ui_err "cannot tell whether ${NEW_TAG} is on origin (git ls-remote failed)."
                print "Refusing to recreate a tag that might already be public."
                exit 1
                ;;
        esac
    fi
fi

# Back to dev. This is the *only* checkout the script performs, and only on success: everything
# before it runs on master because a release is built from master, but leaving the operator on the
# release branch invites the next commit landing there.
_finish_on_dev() {
    if [[ ${DRY_RUN} -eq 1 ]]; then
        ui_dim "[dry-run] would return to dev"
        return 0
    fi
    if ${GIT} checkout dev > /dev/null 2>&1; then
        ui_ok "back on dev - master is the release branch, don't work on it"
    else
        ui_warn "could not switch back to dev; you are still on ${CURRENT_BRANCH}"
    fi
}

# ── 4. Signed tag ────────────────────────────────────────────────────────────
# The tag annotation is the human record *inside* the signed object (`git show <tag>`), and
# every release tag in this repo carries a one-line summary. It is not the same thing as the
# release notes: this says what the build is, the notes accumulate on the GitHub release.
if [[ "${TAG_MODE}" == "create" ]]; then
    print ""
    read TAG_SUMMARY\?"One-line summary for the tag (eg. 'Fixed penalty calcs for stakes including BPD'): "
    if [[ -z "${TAG_SUMMARY//[[:space:]]/}" ]]; then
        ui_err "a one-line summary is required — it is the description inside the signed tag."
        print "Nothing has been tagged, deployed or pushed."
        exit 1
    fi

    ui_stage "Creating signed tag ${NEW_TAG}"
    ui_dim "summary: ${TAG_SUMMARY}"
    _run ${GIT} tag -s "${NEW_TAG}" -m "${TAG_SUMMARY}" || {
        print "ERROR: git tag failed (smartcard PIN or passphrase needed for the tag signature?)"
        exit 1
    }
else
    print "\nTag ${NEW_TAG} already exists (${TAG_MODE}) - not re-creating it."
fi

# ── 5b. Which release? (the state was gathered up front, so this is only the choice) ──
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

# ── Notes editing ───────────────────────────────────────────────────────────────────────────
# Presents the notes in $EDITOR, the way `git commit` does: a comment header, a marker line,
# and the existing text beneath it. Everything above the marker is instructions and is
# discarded, so markdown headings in the notes themselves survive untouched (which is why this
# does not simply strip lines starting with '#').
NOTES_MARKER='<!-- ===== notes below this line; text above it is ignored ===== -->'

# @args: FILE REFERENCE
# True when the two are the same text once line endings and trailing blank lines are normalised.
# A byte comparison is useless here: _edit_notes rewrites the body (trailing newlines included),
# so an editor that changed nothing would still differ by a newline.
_notes_same() {
    local A B
    A=$(sed 's/\r$//' "$1" | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}')
    B=$(sed 's/\r$//' "$2" | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}')
    [[ "${A}" == "${B}" ]]
}

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
    ${=EDITOR_BIN} "${STAGED}" || { ui_err "editor exited non-zero — aborted, nothing pushed."; return 1; }

    # Keep everything after the marker, drop trailing blank lines.
    local BODY
    BODY=$(sed "1,/$(print -r -- "${NOTES_MARKER}" | sed 's/[][\.*^$/]/\\&/g')/d" "${STAGED}")
    BODY=$(print -r -- "${BODY}" | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}')
    rm -f "${STAGED}"

    if [[ -z "${BODY//[[:space:]]/}" ]]; then
        ui_err "the notes came back empty — refusing to publish a release with no notes."
        return 1
    fi
    print -r -- "${BODY}" | tr -d '\r' > "${FILE}"
    return 0
}

# ── 6. Notes — the last thing needing a human, before anything is deployed ──
# Before the deploy, not merely before the push: once the hosts are updated, backing out of the
# notes would leave a live build with no release describing it. Here, an unchanged body (or an
# editor that exits non-zero) aborts while everything is still local.
NOTES_TMP=$(mktemp "${TMPDIR:-/tmp}/release-notes.XXXXXX") || exit 1
trap "rm -f '${NOTES_TMP}' '${NOTES_TMP}.edit'" EXIT

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
    cp "${NOTES_TMP}" "${NOTES_TMP}.orig"
    _edit_notes "${NOTES_TMP}" "${RELEASE_TITLE}" "${REF_TMP}" || exit 1
    rm -f "${REF_TMP}"
else
    # The usual path: pull the current body so the edit is an append, not a replacement.
    ui_spin "reading the current release notes" ${GH} release view "${CURRENT_RELEASE}" --json body -q .body
    print -r -- "${UI_SPIN_OUT}" | tr -d '\r' > "${NOTES_TMP}"
    cp "${NOTES_TMP}" "${NOTES_TMP}.orig"
    _edit_notes "${NOTES_TMP}" "${CURRENT_RELEASE}" || exit 1
fi

# Unchanged notes mean the release was not described, which is almost always a mistake rather
# than an intention - and because this runs before the deploy, aborting costs nothing.
if _notes_same "${NOTES_TMP}" "${NOTES_TMP}.orig"; then
    ui_err "the notes are unchanged — nothing has been deployed, pushed or published."
    print "  The tag ${NEW_TAG} exists locally; re-running will reuse it (see 3b)."
    rm -f "${NOTES_TMP}.orig"
    exit 1
fi
rm -f "${NOTES_TMP}.orig"

# ── 7. Build and publish — or reuse what a previous attempt already built ───
# A release exists only to publish a tag, so the deploy's own prompts are answered here. But a
# retry does not always need the deploy: if the last attempt got as far as building and
# publishing and then failed at signing or at a gh write, the archive it produced is still the
# build of this tag. Rebuilding would be wasted work (two Vite builds and two full mirrors), so
# offer to reuse it.
RELEASE_DIR="${ORIG_PWD}/release"
RELEASE_TGZ="${RELEASE_DIR}/hexmob.win-${NEW_TAG}-build.tgz"
RELEASE_SIG="${RELEASE_TGZ}.sig"

ui_stage "Production deploy of ${NEW_TAG}"
ui_dim "deploy.sh builds and publishes; this script owns the tag, the signature, the push and the release"

REUSE_ARCHIVE=0
if [[ -f "${RELEASE_TGZ}" ]]; then
    SIG_STATE="unsigned"
    if [[ -f "${RELEASE_SIG}" ]] && ${GPG} --verify "${RELEASE_SIG}" "${RELEASE_TGZ}" > /dev/null 2>&1; then
        SIG_STATE="signed and verified"
    fi
    ui_head "An archive from a previous attempt already exists:"
    ui_dim "${RELEASE_TGZ}"
    ui_dim "built $(date -r "${RELEASE_TGZ}" '+%Y-%m-%d %H:%M'), ${SIG_STATE}"

    # The archive proves a publish once returned 0; it does not prove what is live now. Ask both
    # hosts, and let the answer decide the default.
    if _verify_live "${NEW_TAG}"; then
        ui_ok "both hosts are serving ${NEW_TAG} - the deploy did complete"
        REUSE_DEFAULT=Y
    else
        ui_warn "hosts are serving hexmob=${LIVE_HEXMOB:-unknown} tsa=${LIVE_TSA:-unknown}, not ${NEW_TAG}"
        ui_dim "so the previous attempt did not finish publishing: reusing its archive would release"
        ui_dim "a build the sites are not serving"
        REUSE_DEFAULT=n
    fi
    if [[ ${REUSE_DEFAULT} == "Y" ]]; then PROMPT="[Yn]"; else PROMPT="[yN]"; fi
    read -k1 YN\?"Reuse it and skip the rebuild + redeploy? ${PROMPT} "
    print ""
    if [[ ${REUSE_DEFAULT} == "Y" ]]; then
        case "${YN}" in (n|N) REUSE_ARCHIVE=0 ;; (*) REUSE_ARCHIVE=1 ;; esac
    else
        case "${YN}" in (y|Y) REUSE_ARCHIVE=1 ;; (*) REUSE_ARCHIVE=0 ;; esac
    fi
fi

if [[ ${REUSE_ARCHIVE} -eq 1 ]]; then
    ui_ok "reusing the existing archive - no rebuild, no redeploy"
    DEPLOY_STATUS=0
else
    if [[ ${DRY_RUN} -eq 1 ]]; then
        print "  [dry-run] DEPLOY_KIND=p DEPLOY_CONFIRM=yes DEPLOY_TAG=${NEW_TAG} ./scripts/deploy.sh"
        print "  [dry-run] (deploy skipped in a dry run - no hosts touched, no archive produced)"
        DEPLOY_STATUS=0
    else
        DEPLOY_KIND=p DEPLOY_CONFIRM=yes DEPLOY_TAG="${NEW_TAG}" ./scripts/deploy.sh
        DEPLOY_STATUS=$?
    fi
fi

if [[ ${DEPLOY_STATUS} -ne 0 ]]; then
    ui_err "deploy script exited with status ${DEPLOY_STATUS}"
    print "  The tag ${NEW_TAG} exists locally but nothing has been pushed."
    print "  - re-run: the tag is reused; any archive already built will be offered for reuse"
    print "  - abandon: git tag -d ${NEW_TAG}"
    exit ${DEPLOY_STATUS}
fi

# Public truth check: both brands must be serving this tag before anything is published. A mirror
# can succeed while the host serves something else (a cache, or a half-finished previous attempt).
if _verify_live "${NEW_TAG}"; then
    ui_ok "confirmed: both hosts are serving ${NEW_TAG}"
else
    ui_warn "hosts report hexmob=${LIVE_HEXMOB:-unknown} tsa=${LIVE_TSA:-unknown}, expected ${NEW_TAG}"
    if [[ ${DRY_RUN} -eq 1 ]]; then
        ui_dim "(dry-run: nothing was deployed, so a mismatch here is expected)"
    else
        ui_dim "Publishing now would attach the release to a build the sites are not serving."
        read -k1 YN\?"Publish anyway? [y/N] "
        print ""
        case "${YN}" in
            (y|Y) ui_warn "continuing at the operator's request" ;;
            (*)    ui_err "aborted - nothing was pushed or published"
                   print "  Fix the deploy (re-run, or check the hosts), then use the archive reuse path."
                   exit 1 ;;
        esac
    fi
fi

# Sign, unless this archive already carries a valid signature (that is the signing-failed retry).
if [[ -f "${RELEASE_SIG}" ]] && ${GPG} --verify "${RELEASE_SIG}" "${RELEASE_TGZ}" > /dev/null 2>&1; then
    ui_dim "archive already signed and verified - not re-signing"
elif [[ ${DRY_RUN} -eq 1 ]]; then
    ui_dim "[dry-run] would sign ${RELEASE_TGZ}"
else
    _sign_release "${RELEASE_TGZ}" || true
fi

# ── 8. The signed archive must exist ────────────────────────────────────────
# Paths were resolved in step 7; this is the final gate before anything leaves the machine.
if [[ ${DRY_RUN} -eq 1 ]]; then
    ui_dim "(dry-run: skipping the archive/signature check - the deploy that produces them was skipped)"
elif [[ ! -f "$RELEASE_TGZ" ]]; then
    ui_err "${RELEASE_TGZ} not found — cannot publish a release without it."
    exit 1
fi
if [[ ${DRY_RUN} -eq 0 && ! -f "$RELEASE_SIG" ]]; then
    ui_err "${RELEASE_SIG} not found."
    print "The archive is unsigned, and a release whose signature is missing is pointless."
    print "Sign it in a terminal that can prompt for the key, then re-run: the archive will be reused."
    print "  gpg --yes -b ${RELEASE_TGZ}"
    exit 1
fi

# ── 9. Push ─────────────────────────────────────────────────────────────────
# Before touching releases: gh release operations address tags that must exist on the remote.
ui_stage "Pushing master and tags to origin"
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
    ui_stage "Moving release '${CURRENT_RELEASE}' onto tag ${NEW_TAG}"
    _run ${GH} release edit "${CURRENT_RELEASE}" --tag "${NEW_TAG}" --verify-tag \
        || { print "ERROR: could not retag the release (is ${NEW_TAG} pushed?). Nothing else was changed."; exit 1; }

    ui_stage "Replacing the source+sig assets"
    ui_spin "reading the current assets" ${GH} release view "${NEW_TAG}" --json assets -q '.assets[].name'
    for ASSET in ${(f)UI_SPIN_OUT}; do
        if [[ ${DRY_RUN} -eq 1 ]]; then
            print "  [dry-run] would remove ${ASSET}"
        else
            ui_dim "removing ${ASSET}"
            ${GH} release delete-asset "${NEW_TAG}" "${ASSET}" --yes > /dev/null \
                || ui_warn "could not remove ${ASSET}"
        fi
    done
    _run ${GH} release upload "${NEW_TAG}" "${RELEASE_TGZ}" "${RELEASE_SIG}" --clobber \
        || { print "ERROR: upload failed — artifacts are in ${RELEASE_DIR}"; exit 1; }

    _run ${GH} release edit "${NEW_TAG}" --notes-file "${NOTES_TMP}" \
        || ui_warn "could not update the notes — the release body is unchanged."
fi

if [[ ${DRY_RUN} -eq 1 ]]; then
    ui_ok "DRY RUN complete — nothing was tagged, deployed, pushed or published."
    ui_head "The notes that would have been published:"
    sed 's/^/  | /' "${NOTES_TMP}"
    _finish_on_dev
    exit 0
fi

ui_ok "release: ${C_MUTE}$(${GH} release view "${NEW_TAG}" --json url -q .url 2>/dev/null)${C_RESET}"
_finish_on_dev
