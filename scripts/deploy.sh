#!/bin/zsh

if [[ -f ./.env.local ]]; then
    set -a
    source ./.env.local
    set +a
fi

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

GIT=$(command -v git)
GPG=$(command -v gpg)
LFTP=$(command -v lftp)
RSYNC=$(command -v rsync)
# macOS artefacts must never reach a deployed server, or the signed release tarball. One
# list, consumed by both transports and by the pre-upload prune, so they cannot drift.
APPLE_JUNK=(.DS_Store '._*' .AppleDouble .Trashes .Trash .Spotlight-V100 .fseventsd .TemporaryItems .DocumentRevisions-V100 .apdisk)

# Excludes for the rsync transport (lftp gets the same set below, in its glob syntax). The
# dot-file patterns protect hosting plumbing in the destination web root from --delete:
# server config and ACME challenge dirs. Kept as an array so each pattern stays one
# argument; the same patterns inside a quoted string would arrive with literal quotes.
RSYNC_ARGS=(--exclude='.ht*' --exclude='.well-known')
for JUNK in ${APPLE_JUNK}; do RSYNC_ARGS+=(--exclude="${JUNK}"); done

# Mirror flags. The web root is mirrored *without* --delete: lftp's exclude patterns protect
# a path from being transferred but not its contents, so --delete at the root emptied
# .well-known/ (every challenge file inside "isn't in dist/") and then removed the directory.
# Deleting at the root is therefore not offered at all. Only assets/ is reconciled
# destructively, because it is 100% build output and old hashed bundles must not accumulate.
LFTP_MIRROR_ARGS="--verbose --parallel=6 --exclude-glob .ht* --exclude-glob .well-known"
for JUNK in ${APPLE_JUNK}; do LFTP_MIRROR_ARGS="${LFTP_MIRROR_ARGS} --exclude-glob ${JUNK}"; done
LFTP_ASSETS_ARGS="--delete ${LFTP_MIRROR_ARGS}"
unset JUNK
TAR=/usr/bin/tar
BUILD_DIR="./dist/" # must include trailing / for rsync !
DEST_DEV='ftp.hexmob.win:/dev.hexmob.win'
DEST_HEXMOB='ftp.hexmob.win:/public_html'
DEST_TSA='tsa:~/go.tshare.app'
DEST_DEV_TRANSPORT='ftp'
DEST_HEXMOB_TRANSPORT='ftp'
DEST_TSA_TRANSPORT='rsync'
DEST_FTP_PROTOCOL='ftps'
DEST_FTP_PORT='21'
autoload throw catch

# DEPLOY_DEBUG=1 traces every command (PS4 shows the line and function), which is the quickest
# way to see which step actually broke. Off by default: the trace is noisy and the FTP
# password travels in a file, not on a command line, but tracelines still reveal a lot.
if [[ -n "${DEPLOY_DEBUG}" ]]; then
    PS4='+%x:%I: '
    setopt xtrace
    print -r -- "(DEPLOY_DEBUG=${DEPLOY_DEBUG}: tracing to stderr)"
fi

STARTING_BRANCH=$(git rev-parse --abbrev-ref HEAD)
ORIG_PWD="$PWD"   # builds run inside throwaway worktrees; everything comes back here
WT_PARENT=""      # mktemp dir holding this run's worktrees, removed via TRAPEXIT
FTP_CMD_FILE=""   # transient lftp command file (holds credentials); removed by _cleanup
typeset -A WORKTREES # brand => worktree path; one per brand, built side by side

# ----------------------------------------------------------------------------
# Guards
#
# Everything detectable is checked *before* anything is mutated, and blocks the run
# outright. The script never stashes, resets, discards or force-checks-out: it builds in
# a throwaway worktree, so the operator's tree and branch are never a resource it needs
# to take over. Blocked runs exit 5 (see AGENTS.md for the exit codes).
# ----------------------------------------------------------------------------

# The prompts *are* the safety mechanism: production requires typing "yes" and confirming
# the tag. Piped or CI invocation would sail past them - zsh's `read -k1` just fails and
# leaves the variable empty, which selects the dev path - so refuse to run unattached.
_require_tty() {
    [[ -t 0 ]] && return 0
    _block "this script is interactive by design and stdin is not a terminal" \
        "It asks for confirmation before building or deploying anything." \
        "Run it from an interactive shell, not from a pipe or a cron job."
}

# @args: headline, detail lines...
_block() {
    print ""
    ui_err "BLOCKED: ${1}"
    shift
    local LINE
    for LINE in "$@"; do print -r -- "  ${C_MUTE}${LINE}${C_RESET}"; done
    print ""
    exit 5
}

# A release build must correspond to a commit. Nothing uncommitted can reach the build
# any more (it happens in a worktree), but a dirty tree means the operator's attention is
# somewhere else - exactly when a release should not be happening. Refuse and say so.
_require_clean_tree() {
    local STASHES=$(git stash list | wc -l | tr -d ' ')
    if [[ ${STASHES} -gt 0 ]]; then
        print "Note: ${STASHES} stash entr(y/ies) exist. This deploy does not touch them."
    fi
    local DIRTY=$(git status --porcelain --untracked-files=normal)
    [[ -z "${DIRTY}" ]] && return 0
    _block "working tree is not clean - refusing to build a release from it" \
        "The build itself runs in a throwaway worktree, so nothing would leak;" \
        "this is a discipline guard: a release starts from a committed state." \
        "" \
        "In the way:" \
        "${(@f)DIRTY}" \
        "" \
        "Commit it, or park it yourself:  git stash push -u -m 'before release'" \
        "Deploy will not stash, reset or discard anything on your behalf."
}

# The starting branch decides where we return to, and a detached HEAD makes that
# ambiguous - exactly the situation that leads to commits on no branch at all.
_require_release_branch() {
    case "${STARTING_BRANCH}" in
        (dev|master)
            return 0
            ;;
        (HEAD)
            _block "HEAD is detached (at $(git rev-parse --short HEAD)) - cannot release from here" \
                "Pick the branch this release belongs to first:" \
                "  git checkout dev     (or master)"
            ;;
        (*)
            _block "unexpected branch '${STARTING_BRANCH}' for a release deploy" \
                "Release builds come from dev or master, so that we know where to return to."
            ;;
    esac
}

# @args: TAG
_require_tag() {
    local TAG=$1
    ${GIT} rev-parse --verify --quiet "refs/tags/${TAG}" > /dev/null || _block \
        "tag '${TAG}' not found in this repository" \
        "A release is built from a tag, so the tag has to exist locally." \
        "" \
        "Most recent tags:" \
        "$(${GIT} tag --sort=-v:refname | head -10 | tr '\n' ' ')"
    # Warn rather than block: historical tags like TS1 exist and a release of one is not the
    # tool's business. The convention is what release.sh keys its next-version suggestion on
    # (it greps ^[0-9]+\.[0-9]+\.[0-9]+$), so a v-prefixed or otherwise off-pattern tag will
    # later be skipped by that suggestion - worth saying out loud once.
    if [[ ! "${TAG}" =~ '^[0-9]+\.[0-9]+\.[0-9]+$' ]]; then
        print -r -- "Note: '${TAG}' is not MAJOR.MINOR.PATCH, which is the release convention"
        print -r -- "      (release.sh suggests the next version from tags of that shape)."
    fi
    return 0
}

# @args: BRAND
# A half-populated overlay silently produces a half-branded build, which nobody notices
# until it is live. Checked up front for every brand a release is going to publish, so a
# missing variant blocks the run *before* the first byte is uploaded.
_require_overlay() {
    local BRAND=$1 FILE SLASH
    local MISSING=()
    for FILE in $FILES; do
        SLASH=""
        [[ -d "${WORKTREES[$BRAND]}/${FILE}" ]] && SLASH="/"
        [[ -e "${WORKTREES[$BRAND]}/master.pub/${FILE}.${BRAND}${SLASH}" ]] \
            || MISSING+=("master.pub/${FILE}.${BRAND}${SLASH}")
    done
    [[ ${#MISSING} -gt 0 ]] && _block "overlay incomplete for brand '${BRAND}'" \
        "Missing, inside the build worktree:" \
        "${MISSING[@]}" \
        "Every brand needs every file in FILES; nothing has been built or deployed."
    return 0
}

# ----------------------------------------------------------------------------
# Build worktrees
#
# Every build happens in a disposable `git worktree` checkout of the ref being built (the
# tag for a release, HEAD for a dev preview), **one worktree per brand**, side by side.
# That is what keeps the operator's tree, branch, index and stash entirely out of the
# deploy's hands: there is nothing to stash, nothing to restore, and no way for a build
# artefact to end up committed on the wrong branch.
#
# Separate worktrees also make the build phase separable from the publish phase: both
# brands are built (and their artifacts sit in their own trees) before either is uploaded,
# so a release either goes out on both hosts or on neither. See _assemble / _publish.
#
# They are registered in the repo's metadata only until the run ends (_remove_worktrees /
# TRAPEXIT).
# ----------------------------------------------------------------------------

# The scratch area is ./staging inside the checkout: easy to find, inspect after a failed run,
# and delete by hand. It is gitignored, and anything in it is disposable by definition - so a
# leftover from a killed run (including its git registration) is cleared rather than reused.
_clear_staging() {
    local REGISTERED WT
    ${GIT} worktree prune > /dev/null 2>&1
    for WT in ${(f)"$(${GIT} worktree list --porcelain | awk '/^worktree /{print substr($0, 10)}')"}; do
        if [[ "${WT}" == "${ORIG_PWD}/staging"/* ]]; then
            ${GIT} worktree remove --force "${WT}" > /dev/null 2>&1
        fi
    done
    rm -rf "${WT_PARENT}"
    mkdir -p "${WT_PARENT}" || return 1
    return 0
}

# @args: REF (tag or HEAD) BRAND
_make_worktree() {
    local REF=$1
    local BRAND=$2
    if [[ -z "${WT_PARENT}" ]]; then
        WT_PARENT="${ORIG_PWD}/staging"
        _clear_staging || _block "could not prepare ${WT_PARENT}"
    fi
    local WT="${WT_PARENT}/${BRAND}"
    ${GIT} worktree prune > /dev/null 2>&1
    ${GIT} worktree add --detach "${WT}" "${REF}" > /dev/null 2>&1 \
        || _block "could not create the ${BRAND} build worktree for '${REF}'" \
            "Resolve the repo state first; nothing has been built."
    WORKTREES[$BRAND]="${WT}"
    # A fresh checkout has none of the gitignored build inputs, so borrow them. node_modules
    # is essential; .env.local matters only if something reads it from disk (Vite gets the
    # VITE_* values from the exported environment, which deploy.sh sourced from the real one).
    [[ -d "${ORIG_PWD}/node_modules" ]] \
        || _block "node_modules is missing in ${ORIG_PWD}" "Install dependencies before deploying:  yarn install"
    ln -s "${ORIG_PWD}/node_modules" "${WT}/node_modules" \
        || _block "could not link node_modules into the ${BRAND} build worktree"
    [[ -f "${ORIG_PWD}/.env.local" ]] && ln -s "${ORIG_PWD}/.env.local" "${WT}/.env.local"
    # Prove we landed on the requested commit - a checkout that silently does nothing
    # would otherwise build the wrong tree and sign it as the tag.
    local AT=$(${GIT} -C "${WT}" rev-parse HEAD)
    local WANT=$(${GIT} rev-parse "${REF}^{commit}")
    if [[ "${AT}" != "${WANT}" ]]; then
        _remove_worktrees
        _block "${BRAND} build worktree HEAD (${AT[1,8]}) is not '${REF}' (${WANT[1,8]})" \
            "Refusing to build a release from an unexpected commit."
    fi
    ui_dim "worktree ${BRAND}: ${WT} (${REF} @ ${AT[1,8]})"
    return 0
}

_remove_worktrees() {
    local BRAND
    for BRAND in ${(k)WORKTREES}; do
        [[ -n "${WORKTREES[$BRAND]}" ]] && ${GIT} worktree remove --force "${WORKTREES[$BRAND]}" > /dev/null 2>&1
        unset "WORKTREES[$BRAND]"
    done
    [[ -n "${WT_PARENT}" ]] && rm -rf "${WT_PARENT}"
    ${GIT} worktree prune > /dev/null 2>&1
    WT_PARENT=""
    return 0
}

# @args: TGZ path
# Signs the release archive and verifies the signature it just produced. --batch is deliberate:
# unattended signing works for a passphrase-less key (ISSUES.md C2), and if the key ever needs a
# passphrase or a smartcard PIN, gpg must fail fast instead of blocking the deploy behind a
# pinentry prompt. On failure the command is copied to the clipboard so the operator can run it
# by hand in a terminal that can prompt.
_sign_release() {
    local TGZ=$1
    local SIG="${TGZ}.sig"
    if [[ -z "${GPG}" ]] || [[ ! -x "${GPG}" ]]; then
        print "\n  gpg not found: release archive is UNSIGNED."
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
    print "  If the signing key needs a passphrase or a card PIN, run this in a terminal:"
    print "      gpg --yes -b \"${TGZ}\""
    echo -n "gpg --yes -b ${TGZ}" | pbcopy 2>/dev/null && print "  (command copied to clipboard)"
    return 1
}

# Success path only. The main tree was never touched, so there is no state to restore;
# the one convenience kept from the old flow: a release that started on master leaves
# the operator on dev, because further work does not belong on the release branch.
# Deploy touches no branches: the overlay lives in a worktree that is thrown away, and the
# caller decides where to leave HEAD (scripts/release.sh returns to dev).
_finish_release() {
    _remove_worktrees
    return 0
}

TRAPEXIT() {
    _remove_worktrees
}

# Files that differ per brand and must be swapped in before a build: the parts that
# cannot coexist in one built artifact (SEO metadata, CSS palette, image assets).
# BrandLogo.tsx is deliberately absent - it selects its own brand at runtime from
# window.hostIsHM, so a single source serves both builds.
FILES=('index.html' 'src/theme.scss' 'public')

if [[ ! ( -f ./index.html && -d ./master.pub && -d ./src ) ]]; then
    print "ERROR: $0 needs to be run for project root"
    exit 1
fi

# Per-phase teardown. There is nothing to restore on disk: the overlay was applied inside
# the brand's throwaway worktree, which _remove_worktrees deletes wholesale. All this has
# to do is leave the shell where it started. Note it deliberately does *not* unset
# DEPLOY_TARGET - that is a per-run decision (which destination), not a per-phase one.
_cleanup() {
    cd "${ORIG_PWD}" > /dev/null 2>&1
    if [[ -n "${FTP_CMD_FILE}" ]]; then
        rm -f "${FTP_CMD_FILE}"
        FTP_CMD_FILE=""
    fi
}

TRAPINT() {
    setopt localoptions err_exit
    print "\nCaught SIGINT. Run away and live to fight another day! :P"
    _cleanup
    exit 4
}

# @args: TARGET DEST
_configure_target() {
    case "${DEPLOY_TARGET:-$TARGET}" in
        (tsa)
            DEST=${DEST_TSA}
            DEST_TRANSPORT=${DEST_TSA_TRANSPORT}
            ;;
        (dev)
            DEST=${DEST_DEV}
            DEST_TRANSPORT=${DEST_DEV_TRANSPORT}
            DEST_FTP_USERNAME=${DEST_DEV_FTP_USERNAME}
            DEST_FTP_PASSWORD=${DEST_DEV_FTP_PASSWORD}
            [[ "$DEST_TRANSPORT" == 'ftp' ]] && _configure_ftp_destination
            ;;
        (hexmob)
            DEST=${DEST_HEXMOB}
            DEST_TRANSPORT=${DEST_HEXMOB_TRANSPORT}
            DEST_FTP_USERNAME=${DEST_HEXMOB_FTP_USERNAME}
            DEST_FTP_PASSWORD=${DEST_HEXMOB_FTP_PASSWORD}
            [[ "$DEST_TRANSPORT" == 'ftp' ]] && _configure_ftp_destination
            ;;
        (*)
            DEST=${DEST_DEV}
            DEST_TRANSPORT=${DEST_DEV_TRANSPORT}
            DEST_FTP_USERNAME=${DEST_DEV_FTP_USERNAME}
            DEST_FTP_PASSWORD=${DEST_DEV_FTP_PASSWORD}
            [[ "$DEST_TRANSPORT" == 'ftp' ]] && _configure_ftp_destination
            ;;
    esac
}

_prompt_for_secret() {
    local PROMPT="$1"
    local SECRET
    local TRACING=0
    [[ -o xtrace ]] && TRACING=1

    # xtrace would echo the value being read, so silence it for the duration. The result is
    # emitted before tracing resumes, for the same reason.
    set +x
    read -s SECRET\?"${PROMPT}: "
    print ""
    print -- "$SECRET"
    [[ ${TRACING} -eq 1 ]] && set -x
}

_configure_ftp_destination() {
    [[ "$DEST" == *:* ]] || throw "FTP destination must be host:/path, got ${DEST}"

    DEST_FTP_HOST=${DEST%%:*}
    DEST_FTP_DIR=${DEST#*:}

    [[ "$DEST_FTP_HOST" == "" ]] && throw 'DEST_FTP_HOST not set'
    [[ "$DEST_FTP_DIR" == "" ]] && throw 'DEST_FTP_DIR not set'
}

# No macOS artefact may reach a deployed server (or the signed release tarball, which is
# made from dist/). Transport excludes are not enough on their own: public/ is staged from
# master.pub/public.<brand>/ and Vite copies it verbatim into dist/, so junk can enter the
# build output from a Finder visit to any of those directories. Prune the output itself.
_prune_apple_junk() {
    local JUNK FOUND COUNT=0
    for JUNK in ${APPLE_JUNK}; do
        FOUND=$(find "${BUILD_DIR}" -name "${JUNK}" -prune -print 2>/dev/null)
        if [[ -n "${FOUND}" ]]; then
            print "  removing: ${FOUND//$'\n'/, }"
            find "${BUILD_DIR}" -name "${JUNK}" -prune -exec rm -rf {} + 2>/dev/null
            COUNT=$(( COUNT + $(print -r -- "${FOUND}" | wc -l | tr -d ' ') ))
        fi
    done
    [[ ${COUNT} -gt 0 ]] && ui_dim "pruned ${COUNT} macOS artefact(s) from ${BUILD_DIR}"
    return 0
}

# Writes the lftp command script. Credentials live in this 0600 file rather than on
# lftp's command line, where `ps` would show them to any local user for the duration of
# the upload. lftp's LFTP_PASSWORD fallback is not used because it only applies to `open
# <site>` forms, not `open -u user` (verified against the live host: it silently falls
# back to anonymous).
# @args: none (reads the DEST_FTP_* / SSL_* values from the caller's scope)
_write_ftp_command_file() {
    local TMP_ROOT="${TMPDIR:-/tmp}"
    FTP_CMD_FILE=$(mktemp "${TMP_ROOT%/}/hexmob-ftp.XXXXXX") || throw 'mktemp failed for the FTP command file'
    chmod 600 "${FTP_CMD_FILE}" || throw 'chmod 600 failed for the FTP command file'
    cat > "${FTP_CMD_FILE}" <<EOF || throw 'could not write the FTP command file'
# Without fail-exit, a failed command (a bad cd, say) is followed by a successful one and
# lftp still exits 0 - the deploy would report success having uploaded the wrong thing.
set cmd:fail-exit true
set dns:order inet
set ftp:ssl-force ${SSL_FORCE}
set ftp:ssl-protect-data ${SSL_PROTECT_DATA}
set ssl:verify-certificate ${SSL_VERIFY}
set ssl:check-hostname ${SSL_CHECK_HOSTNAME}
set ftp:passive-mode true
set ftp:prefer-epsv false
set ftp:fix-pasv-address true
open -u "${DEST_FTP_USERNAME}","${DEST_FTP_PASSWORD}" -p ${DEST_FTP_PORT} ${OPEN_URL}
cd ${DEST_FTP_DIR}
# Upload first, delete the stale entry point afterwards. Deleting index.html/index.php *before*
# the mirror leaves the site with no entry point at all for the duration of the upload - and
# permanently, if the mirror then fails. index.php is simply overwritten by the mirror, so it
# must never be removed; the leftover index.html is deleted after a successful upload purely
# to evict the URL-keyed server cache. The tolerated form keeps cmd:fail-exit from aborting on
# a file that is already absent.
mirror -R ${LFTP_ASSETS_ARGS} ${BUILD_DIR}assets/ assets/
mirror -R ${LFTP_MIRROR_ARGS} ${BUILD_DIR} .
rm -f index.html || echo "(no remote index.html to remove)"
bye
EOF
    return 0
}

_deploy_build_output() {
    case "$DEST_TRANSPORT" in
        (rsync)
            ui_dim "rsync ${BUILD_DIR} => ${DEST}"
            ${RSYNC} "${RSYNC_ARGS[@]}" -r --delete ${BUILD_DIR} ${DEST} \
                || throw "rsync failed (exit $?) uploading ${BUILD_DIR} => ${DEST}"
            ;;
        (ftp)
            if [[ -z ${LFTP} || ! -x ${LFTP} ]]; then
                print "Error: lftp is not installed or not found in PATH."
                print "Install it with: brew install lftp"
                throw 'lftp is not installed'
            fi
            [[ "$DEST_FTP_HOST" == "" ]] && throw 'DEST_FTP_HOST not set'
            [[ "$DEST_FTP_USERNAME" == "" ]] && read DEST_FTP_USERNAME\?"FTP username for ${TARGET}: "
            [[ "$DEST_FTP_PASSWORD" == "" ]] && DEST_FTP_PASSWORD=$(_prompt_for_secret "FTP password for ${DEST_FTP_USERNAME}@${DEST_FTP_HOST}")

            local OPEN_URL="ftp://${DEST_FTP_HOST}"
            local SSL_FORCE=false

            case "$DEST_FTP_PROTOCOL" in
                (ftp)
                    ;;
                (ftps)
                    SSL_FORCE=true
                    ;;
                (ftps-legacy)
                    OPEN_URL="ftps://${DEST_FTP_HOST}"
                    SSL_FORCE=true
                    ;;
                (*)
                    throw "Unsupported DEST_FTP_PROTOCOL: ${DEST_FTP_PROTOCOL}"
                    ;;
            esac

            # TLS policy, overridable per deployment. Both defaults were confirmed against
            # the host (see AGENTS.md 3): AUTH TLS/PBSZ/PROT P all succeed, and the cert
            # chain validates against the system store.
            #  - verify-certificate: the host presents its provider's wildcard cert
            #    (CN=*.myownserver.net), so the *hostname* cannot be verified - checking it
            #    would fail every deploy. The chain is still validated, which is the part
            #    that requires a CA-signed certificate.
            #  - protect-data: encrypts the payload (PROT P) as well as the control channel.
            local SSL_VERIFY=${DEST_FTP_VERIFY_CERT:-true}
            local SSL_CHECK_HOSTNAME=${DEST_FTP_CHECK_HOSTNAME:-false}
            local SSL_PROTECT_DATA=${DEST_FTP_PROTECT_DATA:-true}

            ui_dim "mirror ${BUILD_DIR} => ${DEST}"
            ui_dim "tls: force=${SSL_FORCE} verify-certificate=${SSL_VERIFY} check-hostname=${SSL_CHECK_HOSTNAME} protect-data=${SSL_PROTECT_DATA}"
            _write_ftp_command_file || throw 'could not prepare the FTP command file'
            ${LFTP} -f "${FTP_CMD_FILE}" || throw "FTP mirror to ${DEST_FTP_HOST} failed"
            ;;
        (*)
            throw "Unsupported transport: ${DEST_TRANSPORT}"
            ;;
    esac
}

# @args: LABEL COMMAND...
# Runs one phase, and turns any `throw` out of it into a readable message plus the
# documented exit 2. The worktree removal is TRAPEXIT's job, so it happens either way.
_guarded() {
    local LABEL=$1
    shift
    { "$@" } always {
        if catch '*'; then
            ui_err "${LABEL} failed: ${CAUGHT}"
            ui_dim "(re-run with DEPLOY_DEBUG=1 for a command trace)"
            _cleanup
            exit 2
        fi
        _cleanup
    }
}

# @args: BRAND
# Build phase: overlay the brand into its own worktree and produce dist/. Nothing is
# uploaded here, which is what lets a release build both brands before publishing either.
_assemble() {
    local TARGET=$1
    local WT=${WORKTREES[$TARGET]}
    [[ -z "${WT}" ]] && throw "no build worktree for '${TARGET}' - _make_worktree must run first"

    # Build inside the disposable checkout: from here on ./src, ./public, ./dist and
    # ./master.pub all refer to the ref being built, not to the operator's tree.
    cd "${WT}" || throw "could not enter the ${TARGET} build worktree ${WT}"
    ui_stage "Building ${TARGET}"

    _require_overlay "${TARGET}"

    # Dual branding: overlay the brand's files. No backups are taken because the worktree
    # is disposable - the branch's files were never touched.
    for FILE in $FILES; do
        SLASH=""
        [[ -d "$FILE" ]] && SLASH="/"
        ${RSYNC} -r -I --delete "./master.pub/${FILE}.${TARGET}${SLASH}" "./${FILE}${SLASH}" \
            || throw "could not apply the ${TARGET} overlay to ${FILE}"
    done

    # Stamp the brand that is actually compiled into the bundle, so the runtime brand
    # constant (IS_HM / IS_TSA) folds to this build's brand rather than being decided by
    # the hostname - dev.hexmob.win deliberately serves the tsa brand.
    export VITE_BRAND="${TARGET}"
    # Start from an empty output dir, so one brand's asset can never survive into another
    # artifact or into the signed tarball.
    rm -rf "${BUILD_DIR}" || throw "could not clear ${BUILD_DIR}"
    yarn build || throw 'the build itself failed'
    ui_ok "build done (${TARGET})"
    _prune_apple_junk
    # Rename to .php so nginx serves it via PHP-FPM rather than the static
    # open_file_cache, which on this host holds stale content for days.
    mv "${BUILD_DIR}index.html" "${BUILD_DIR}index.php" || throw 'Failed to rename index.html to index.php'
}

# @args: BRAND
# Publish phase: upload an already-built brand. Separate from _assemble so that both
# brands can be built first and only then deployed - a release therefore either lands on
# both hosts or on neither.
_publish() {
    local TARGET=$1 # dynamic scope: _configure_target reads $TARGET / $DEPLOY_TARGET
    local WT=${WORKTREES[$TARGET]}
    [[ -z "${WT}" ]] && throw "no build worktree for '${TARGET}' - _make_worktree must run first"

    _configure_target
    [[ "$DEST" == "" ]] && throw 'DEST not set'
    [[ "$DEST_TRANSPORT" == "" ]] && throw 'DEST_TRANSPORT not set'

    cd "${WT}" || throw "could not enter the ${TARGET} build worktree ${WT}"
    [[ -f "${BUILD_DIR}index.php" ]] \
        || throw "nothing to publish for '${TARGET}' - the ${TARGET} build is missing"
    ui_stage "Publishing ${TARGET}" "=> ${DEST} via ${DEST_TRANSPORT}"
    _deploy_build_output
}

_require_tty
# Which flow this is comes from the caller, never from a prompt: one stray keypress used to be
# the difference between a preview and a production deploy. Dev is the default because it is
# what this script is normally run for; production is reachable only from scripts/release.sh,
# which supplies DEPLOY_KIND=p together with DEPLOY_TAG and DEPLOY_CONFIRM=yes.
DEPLOY_TYPE="${DEPLOY_KIND:-d}"
case "${DEPLOY_TYPE}" in
    (d|D) ui_dim "deployment: dev preview → ${DEST_DEV}" ;;
    (p|P) ui_dim "deployment: production (invoked as part of a release)" ;;
    (*)   _block "unknown DEPLOY_KIND '${DEPLOY_TYPE}'" \
              "Expected 'd' (dev preview, the default) or 'p' (release only).";;
esac
case "$DEPLOY_TYPE" in
    ([Pp])
        # Production is only reachable as the deploy step of a release: a tagged build whose
        # tarball and signature are about to be published. Deploying production on its own
        # would leave the hosts serving a build that no release describes.
        if [[ -z "${DEPLOY_TAG}" || "${DEPLOY_CONFIRM}" != "yes" ]]; then
            _block "production deploy requires DEPLOY_TAG and DEPLOY_CONFIRM=yes" \
                "A standalone production deploy is deliberately not offered: the live build" \
                "must correspond to a published, signed release." \
                "" \
                "Use:  yarn release"
        fi
        # Block early: a release built from a tree we cannot account for is worse than
        # no release at all. Nothing above this point has mutated anything.
        _require_clean_tree
        _require_release_branch
        ui_dim "production deployment confirmed (DEPLOY_CONFIRM=yes)"
        TAG="${DEPLOY_TAG}"
        ui_kv "tag" "${TAG}"
        _require_tag "${TAG}"
        print ""
        ui_kv "tag" "${TAG}"
        ui_kv "branch" "${STARTING_BRANCH} ($(git rev-parse --short HEAD))"
        ui_kv "builds" "tsa => ${DEST_TSA}"
        print "             hexmob => ${DEST_HEXMOB}"
        ui_dim "order: build both, then publish both (a failed build publishes nothing)"
        read -k1 YN\?"Build ${TAG} in a throwaway worktree and deploy it? [Y/n]: "
        print ""
        case ${YN} in
            ([Nn])
                print "Aborted"
                exit 0
                ;;
            (*)
                _make_worktree "${TAG}" tsa
                _make_worktree "${TAG}" hexmob
                # Preflight everything detectable before the first upload: both brands'
                # overlays must be complete, or the release would stop half-published.
                _require_overlay tsa
                _require_overlay hexmob

                export VITE_VERSION="${TAG}"

                print "Building release ${TAG} (both brands) ..."
                # Build both first: if either build fails, nothing has been published.
                _guarded "tsa build" _assemble tsa
                _guarded "hexmob build" _assemble hexmob

                print "\nBoth builds succeeded - publishing."
                _guarded "tsa deploy" _publish tsa
                _guarded "hexmob deploy" _publish hexmob

                # Create release tarball for gpg signing and upload to repo 'official release tag'.
                # Paths inside the archive stay relative (dist/...) so extraction is predictable.
                RELEASE_DIR="${ORIG_PWD}/release"
                RELEASE_TGZ="${RELEASE_DIR}/hexmob.win-${TAG}-build.tgz"
                print -n "\nPreparing HEXMOB release files at ${RELEASE_DIR} ... "
                [[ -d ${RELEASE_DIR} ]] && rm -f ${RELEASE_DIR}/*
                [[ ! -d ${RELEASE_DIR} ]] && mkdir ${RELEASE_DIR}
                ${TAR} -C "${WORKTREES[hexmob]}" -czf "${RELEASE_TGZ}" dist \
                    || _block "could not create ${RELEASE_TGZ}"
                print "Done!"

                print ""; ui_ok "${C_BOLD}live deployment completed${C_RESET}"
                _sign_release || true
                ;;
        esac
        _finish_release
        ;;

    (*)
        # Dev deploys also build in a worktree, so they cannot leave the tree half-branded.
        # The ref is HEAD: uncommitted work is deliberately *not* deployed (use `yarn dev`
        # to preview edits locally), which is worth saying out loud when the tree is dirty.
        if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
            print "\nNote: the working tree has uncommitted changes."
            print "      Deploying HEAD ($(git rev-parse --short HEAD)) - they will NOT be included."
        fi
        # DEPLOY_TARGET selects the destination, independently of TARGET (the brand):
        # this must be the dev host, never the tsa production one.
        DEPLOY_TARGET=dev
        print "Deploying to dev target (${DEST_DEV}) ..."
        _make_worktree HEAD tsa
        _guarded "tsa build" _assemble tsa
        _guarded "tsa deploy" _publish tsa
        _remove_worktrees
        ;;
esac

