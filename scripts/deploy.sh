#!/bin/zsh

if [[ -f ./.env.local ]]; then
    set -a
    source ./.env.local
    set +a
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

LFTP_MIRROR_ARGS="--delete --verbose --parallel=6 --exclude-glob .ht* --exclude-glob .well-known"
for JUNK in ${APPLE_JUNK}; do LFTP_MIRROR_ARGS="${LFTP_MIRROR_ARGS} --exclude-glob ${JUNK}"; done
unset JUNK
SCP=/usr/bin/scp
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

STARTING_BRANCH=$(git rev-parse --abbrev-ref HEAD)
ORIG_PWD="$PWD"   # builds run inside a throwaway worktree; everything comes back here
WORKTREE=""       # set by _make_worktree, removed by _remove_worktree via TRAPEXIT

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
    print "\nBLOCKED: $1"
    shift
    local LINE
    for LINE in "$@"; do print -r -- "  ${LINE}"; done
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
    ${GIT} rev-parse --verify --quiet "refs/tags/$1" > /dev/null && return 0
    _block "tag '$1' not found in this repository" \
        "A release is built from a tag, so the tag has to exist locally." \
        "" \
        "Most recent tags:" \
        "$(${GIT} tag --sort=-v:refname | head -10 | tr '\n' ' ')"
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
        [[ -d "${WORKTREE}/${FILE}" ]] && SLASH="/"
        [[ -e "${WORKTREE}/master.pub/${FILE}.${BRAND}${SLASH}" ]] \
            || MISSING+=("master.pub/${FILE}.${BRAND}${SLASH}")
    done
    [[ ${#MISSING} -gt 0 ]] && _block "overlay incomplete for brand '${BRAND}'" \
        "Missing, inside the build worktree:" \
        "${MISSING[@]}" \
        "Every brand needs every file in FILES; nothing has been built or deployed."
    return 0
}

# ----------------------------------------------------------------------------
# Build worktree
#
# Every build happens in a disposable `git worktree` checkout of the ref being built
# (the tag for a release, HEAD for a dev preview). That is what keeps the operator's
# tree, branch, index and stash entirely out of the deploy's hands: there is nothing
# to stash, nothing to restore, and no way for a build artefact to end up committed
# on the wrong branch. The worktree is registered in the repo's metadata only until
# the run ends (see _remove_worktree / TRAPEXIT).
# ----------------------------------------------------------------------------

# @args: REF (tag or HEAD)
_make_worktree() {
    local REF=$1
    local PARENT
    ${GIT} worktree prune > /dev/null 2>&1
    PARENT=$(mktemp -d "${TMPDIR:-/tmp}/hexmob-deploy.XXXXXX") \
        || _block "could not create a temporary directory for the build worktree"
    WORKTREE="${PARENT}/wt"
    ${GIT} worktree add --detach "${WORKTREE}" "${REF}" > /dev/null 2>&1 \
        || _block "could not create a build worktree for '${REF}'" "Resolve the repo state first; nothing has been built."
    # A fresh checkout has none of the gitignored build inputs, so borrow them. node_modules
    # is essential; .env.local matters only if something reads it from disk (Vite gets the
    # VITE_* values from the exported environment, which deploy.sh sourced from the real one).
    [[ -d "${ORIG_PWD}/node_modules" ]] \
        || _block "node_modules is missing in ${ORIG_PWD}" "Install dependencies before deploying:  yarn install"
    ln -s "${ORIG_PWD}/node_modules" "${WORKTREE}/node_modules" \
        || _block "could not link node_modules into the build worktree"
    [[ -f "${ORIG_PWD}/.env.local" ]] && ln -s "${ORIG_PWD}/.env.local" "${WORKTREE}/.env.local"
    # Prove we landed on the requested commit - a checkout that silently does nothing
    # would otherwise build the wrong tree and sign it as the tag.
    local AT=$(${GIT} -C "${WORKTREE}" rev-parse HEAD)
    local WANT=$(${GIT} rev-parse "${REF}^{commit}")
    if [[ "${AT}" != "${WANT}" ]]; then
        _remove_worktree
        _block "build worktree HEAD (${AT[1,8]}) is not '${REF}' (${WANT[1,8]})" \
            "Refusing to build a release from an unexpected commit."
    fi
    print "Build worktree: ${WORKTREE} (${REF} @ ${AT[1,8]})"
    return 0
}

_remove_worktree() {
    [[ -z "${WORKTREE}" ]] && return 0
    ${GIT} worktree remove --force "${WORKTREE}" > /dev/null 2>&1
    rm -rf "${WORKTREE:h}" # the mktemp parent
    ${GIT} worktree prune > /dev/null 2>&1
    WORKTREE=""
    return 0
}

# Success path only. The main tree was never touched, so there is no state to restore;
# the one convenience kept from the old flow: a release that started on master leaves
# the operator on dev, because further work does not belong on the release branch.
_finish_release() {
    _remove_worktree
    if [[ "${STARTING_BRANCH}" == "master" ]]; then
        ${GIT} checkout dev > /dev/null 2>&1 \
            && print "\nSwitched to dev - master is the release branch, don't work on it."
    fi
    return 0
}

TRAPEXIT() {
    _remove_worktree
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

# Per-build teardown. There is nothing to restore on disk any more: the overlay was
# applied inside the throwaway worktree, which _remove_worktree deletes wholesale. All
# this has to do is leave the shell where it started and drop the per-target variables.
_cleanup() {
    cd "${ORIG_PWD}" > /dev/null 2>&1
    unset TARGET
    unset DEST
    unset DEPLOY_TARGET
    unset DEST_TRANSPORT
    unset DEST_FTP_HOST
    unset DEST_FTP_DIR
    unset DEST_FTP_USERNAME
    unset DEST_FTP_PASSWORD
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
            DEST_FTP_PROTOCOL=${DEST_FTP_PROTOCOL}
            DEST_FTP_PORT=${DEST_FTP_PORT}
            DEST_FTP_USERNAME=${DEST_DEV_FTP_USERNAME}
            DEST_FTP_PASSWORD=${DEST_DEV_FTP_PASSWORD}
            [[ "$DEST_TRANSPORT" == 'ftp' ]] && _configure_ftp_destination
            ;;
        (hexmob)
            DEST=${DEST_HEXMOB}
            DEST_TRANSPORT=${DEST_HEXMOB_TRANSPORT}
            DEST_FTP_PROTOCOL=${DEST_FTP_PROTOCOL}
            DEST_FTP_PORT=${DEST_FTP_PORT}
            DEST_FTP_USERNAME=${DEST_HEXMOB_FTP_USERNAME}
            DEST_FTP_PASSWORD=${DEST_HEXMOB_FTP_PASSWORD}
            [[ "$DEST_TRANSPORT" == 'ftp' ]] && _configure_ftp_destination
            ;;
        (*)
            DEST=${DEST_DEV}
            DEST_TRANSPORT=${DEST_DEV_TRANSPORT}
            DEST_FTP_PROTOCOL=${DEST_FTP_PROTOCOL}
            DEST_FTP_PORT=${DEST_FTP_PORT}
            DEST_FTP_USERNAME=${DEST_DEV_FTP_USERNAME}
            DEST_FTP_PASSWORD=${DEST_DEV_FTP_PASSWORD}
            [[ "$DEST_TRANSPORT" == 'ftp' ]] && _configure_ftp_destination
            ;;
    esac
}

_prompt_for_secret() {
    local PROMPT="$1"
    local SECRET

    read -s SECRET\?"${PROMPT}: "
    print ""
    print -- "$SECRET"
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
    [[ ${COUNT} -gt 0 ]] && print "Pruned ${COUNT} macOS artefact(s) from ${BUILD_DIR}"
    return 0
}

_deploy_build_output() {
    case "$DEST_TRANSPORT" in
        (rsync)
            print "RSYNCing ${BUILD_DIR} => ${DEST}"
            ${RSYNC} "${RSYNC_ARGS[@]}" -r --delete ${BUILD_DIR} ${DEST} || throw ''
            ;;
        (ftp)
            if [[ -z ${LFTP} || ! -x ${LFTP} ]]; then
                print "Error: lftp is not installed or not found in PATH."
                print "Install it with: brew install lftp"
                throw ''
            fi
            [[ "$DEST_FTP_HOST" == "" ]] && throw 'DEST_FTP_HOST not set'
            [[ "$DEST_FTP_USERNAME" == "" ]] && read DEST_FTP_USERNAME\?"FTP username for ${TARGET}: "
            [[ "$DEST_FTP_PASSWORD" == "" ]] && DEST_FTP_PASSWORD=$(_prompt_for_secret "FTP password for ${DEST_FTP_USERNAME}@${DEST_FTP_HOST}")

            local OPEN_URL="ftp://${DEST_FTP_HOST}"
            local SSL_FORCE=false
            local SSL_PROTECT_DATA=false

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

            print "FTP mirroring ${BUILD_DIR} => ${DEST}"
            ${LFTP} -e "set dns:order inet; set ftp:ssl-force ${SSL_FORCE}; set ftp:ssl-protect-data ${SSL_PROTECT_DATA}; set ftp:passive-mode true; set ftp:prefer-epsv false; set ftp:fix-pasv-address true; set ssl:verify-certificate false; open -u \"${DEST_FTP_USERNAME}\",\"${DEST_FTP_PASSWORD}\" -p ${DEST_FTP_PORT} ${OPEN_URL}; cd ${DEST_FTP_DIR}; rm -f index.html; rm -f index.php; mirror -R ${LFTP_MIRROR_ARGS} ${BUILD_DIR} .; bye" || throw ''
            ;;
        (*)
            throw "Unsupported transport: ${DEST_TRANSPORT}"
            ;;
    esac
}

_build() {
    {
        [[ "$TARGET" == "" ]] && throw 'TARGET not set'
        _configure_target
        [[ "$DEST" == "" ]] && throw 'DEST not set'
        [[ "$DEST_TRANSPORT" == "" ]] && throw 'DEST_TRANSPORT not set'
        [[ -z "${WORKTREE}" ]] && throw 'no build worktree - _make_worktree must run first'

        # Build inside the disposable checkout: from here on ./src, ./public, ./dist and
        # ./master.pub all refer to the ref being built, not to the operator's tree.
        cd "${WORKTREE}" || throw "could not enter the build worktree ${WORKTREE}"
        print "\nBuild target is ${TARGET} ( => ${DEST} via ${DEST_TRANSPORT})\n"

        # Overlay check (and again up front for releases, so a missing variant cannot
        # surface after the other brand has already been published). throw, not _block:
        # the always block still has to get the shell out of the worktree.
        _require_overlay "${TARGET}"

        # Dual branding: overlay the brand's files inside the worktree. No backups are
        # taken because the worktree is disposable - the branch's files are untouched,
        # both because they were never edited and because this tree is not the branch.
        for FILE in $FILES; do
            SLASH=""
            [[ -d "$FILE" ]] && SLASH="/"
            ${RSYNC} -r -I --delete "./master.pub/${FILE}.${TARGET}${SLASH}" "./${FILE}${SLASH}" \
                || throw "could not apply the ${TARGET} overlay to ${FILE}"
        done

        # build
        # Stamp the brand that is actually being compiled into the bundle, so the runtime
        # brand switch (window.hostIsHM / hostIsTSA) follows the published brand rather
        # than the hostname - dev.hexmob.win deliberately serves the tsa brand. Set per
        # _build call, since production compiles both brands in one process.
        export VITE_BRAND="${TARGET}"
        # Start from an empty output dir. Vite empties it by default, but production builds
        # both brands into the same worktree, and one brand's asset surviving into the
        # other's artifact (and into the signed tarball) is not a failure mode worth
        # leaving to a bundler default.
        rm -rf "${BUILD_DIR}" || throw "could not clear ${BUILD_DIR}"
        yarn build || throw ''
        print "BUILD DONE"
        _prune_apple_junk
        # Rename to .php so nginx serves it via PHP-FPM rather than the static
        # open_file_cache, which on this host holds stale content for days.
        mv "${BUILD_DIR}index.html" "${BUILD_DIR}index.php" || throw 'Failed to rename index.html to index.php'

        _deploy_build_output

    } always {
        if catch '*'; then
            # exit, not throw: re-throwing here leaves the shell to decide the status (1),
            # so the documented failure code was never actually produced. TRAPEXIT still
            # runs, so the worktree is removed either way.
            print "D'oh! CAUGHT: [$CAUGHT]"
            _cleanup
            exit 2
        fi
        _cleanup
    }
}

_require_tty
read -k1 DEPLOY_TYPE\?"Poduction or Dev deployment? [D/p]: "
case "$DEPLOY_TYPE" in
    ([Pp])
        # Block early: a release built from a tree we cannot account for is worse than
        # no release at all. Nothing above this point has mutated anything.
        _require_clean_tree
        _require_release_branch
        print "\n"
        read AMSURE\?"PRODUCTION deployment! Enter \"yes\" to continue: "
        if [[ ! "yes" = "$AMSURE" ]]; then print "Didn't think so." ; exit 0 ; fi
        print "Enter release version tag for this PRODUCTION build"
        read TAG\?"eg. 0.4.26 -- this must be an existing git tag: "
        _require_tag "${TAG}"
        print ""
        print "  tag     : ${TAG}"
        print "  branch  : ${STARTING_BRANCH} ($(git rev-parse --short HEAD))"
        print "  builds  : tsa => ${DEST_TSA}"
        print "            hexmob => ${DEST_HEXMOB}"
        read -k1 YN\?"Build ${TAG} in a throwaway worktree and deploy it? [Y/n]: "
        print ""
        case ${YN} in
            ([Nn])
                print "Aborted"
                exit 0
                ;;
            (*)
                _make_worktree "${TAG}"
                # Preflight everything detectable before the first upload: both brands'
                # overlays must be complete, or the release would stop half-published.
                _require_overlay tsa
                _require_overlay hexmob

                export VITE_VERSION="${TAG}"

                print "Deploying version ${TAG} ..."

                TARGET=tsa _build
                sleep 1

                TARGET=hexmob _build
                sleep 1

                # Create release tarball for gpg signing and upload to repo 'official release tag'.
                # Paths inside the archive stay relative (dist/...) so extraction is predictable.
                RELEASE_DIR="${ORIG_PWD}/release"
                RELEASE_TGZ="${RELEASE_DIR}/hexmob.win-${TAG}-build.tgz"
                print -n "\nPreparing HEXMOB release files at ${RELEASE_DIR} ... "
                [[ -d ${RELEASE_DIR} ]] && rm -f ${RELEASE_DIR}/*
                [[ ! -d ${RELEASE_DIR} ]] && mkdir ${RELEASE_DIR}
                ${TAR} -C "${WORKTREE}" -czf "${RELEASE_TGZ}" dist \
                    || _block "could not create ${RELEASE_TGZ}"
                print "Done!"

                print "\nLIVE DEPLOYMENT COMPLETED."
                echo -n "gpg --yes -b ${RELEASE_TGZ}" | pbcopy
                print "\nRemember to sign the release tarbal: \"gpg --yes -b ${RELEASE_TGZ}\" [copied to clipboard]"
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
        print "Deploying to dev target ..."
        _make_worktree HEAD
        DEPLOY_TARGET=dev TARGET=tsa _build
        _remove_worktree
        ;;
esac

