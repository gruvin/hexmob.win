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
RSYNC_ARGS="--exclude='.ht*' --exclude='.DS*' --exclude='.Trashes' --exclude='.well-known'"
LFTP_MIRROR_ARGS="--delete --verbose --parallel=6 --exclude-glob .ht* --exclude-glob .DS* --exclude-glob .Trashes --exclude-glob .well-known"
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

# target unique files list ...
FILES=('index.html' 'src/theme.scss' 'src/BrandLogo.tsx' 'public')

if [[ ! ( -f ./index.html && -d ./master.pub && -d ./src ) ]]; then
    print "ERROR: $0 needs to be run for project root"
    exit 1
fi

# @args: list of filenames eg $FILES
_cleanup() {
    for FILE in ${FILES}; do
        F="./master.pub/${FILE}-orig"
        SLASH=""; [[ -d "${F}" ]] && SLASH="/"
        [[ -e "./${F}${SLASH}" ]] && ( $RSYNC -r -I --delete "./${F}${SLASH}" "./${FILE}${SLASH}" || throw '' )
        [[ -e "./${F}${SLASH}" ]] && ( rm -rf "./${F}${SLASH}" || throw '' )
    done
    # If deployed from master, return to dev to avoid accidental commits to master
    [[ "$STARTING_BRANCH" == "master" ]] && ${GIT} checkout dev > /dev/null 2>&1
    ${GIT} stash pop  > /dev/null 2>&1
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

_deploy_build_output() {
    case "$DEST_TRANSPORT" in
        (rsync)
            print "RSYNCing ${BUILD_DIR} => ${DEST}"
            ${RSYNC} ${RSYNC_APPLE_ARGS} -r --delete ${BUILD_DIR} ${DEST} || throw ''
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

        print "\nBuild target is ${TARGET} ( => ${DEST} via ${DEST_TRANSPORT})\n"
        # dual branding stuff
        for FILE in $FILES; do
            SLASH=""
            [[ -d "$FILE" ]] && SLASH="/"
            ${RSYNC} -r -I --delete "${FILE}${SLASH}" "./master.pub/${FILE}-orig" || throw ''
            ${RSYNC} -r -I --delete "./master.pub/${FILE}.${TARGET}${SLASH}" "./${FILE}${SLASH}" || throw ''
        done

        # build
        yarn build || throw ''
        print "BUILD DONE"
        # Rename to .php so nginx serves it via PHP-FPM rather than the static
        # open_file_cache, which on this host holds stale content for days.
        mv "${BUILD_DIR}index.html" "${BUILD_DIR}index.php" || throw 'Failed to rename index.html to index.php'

        _deploy_build_output

    } always {
        if catch '*'; then
            print "D'oh! CAUGHT: [$CAUGHT]"
            _cleanup
            throw ''
            exit 2
        fi
        _cleanup
    }
}

read -k1 DEPLOY_TYPE\?"Poduction or Dev deployment? [D/p]: "
case "$DEPLOY_TYPE" in
    ([Pp])
        print "\n"
        read AMSURE\?"PRODUCTION deployment! Enter \"yes\" to continue: "
        if [[ ! "yes" = "$AMSURE" ]]; then print "Didn't think so." ; exit 0 ; fi
        print "Enter release version tag for this PRODUCTION build"
        read TAG\?"eg. v0.2.3B -- this should match a master branch git tag: "
        CHECKOUT_CMD="$GIT stash > /dev/null && $GIT checkout ${TAG} > /dev/null 2>&1"
        read -k1 YN\?"OK to execute '${CHECKOUT_CMD}'? [Y/n]: "
        case ${YN} in
            ([Nn])
                print "\nAborted"
                exit 0
                ;;
            (*)
                eval ${CHECKOUT_CMD}
                if [[ $? -ne 0 ]]; then print "\nWell that went badly :/\n"; exit 3; fi

                export VITE_VERSION="${TAG}"

                print "Deploying version ${TAG} ..."

                TARGET=tsa _build
                sleep 1

                TARGET=hexmob _build
                sleep 1

                # Create release tarbal for gpg signing and upload to repo 'official release tag'
                RELEASE_DIR="./release"
                RELEASE_TGZ="${RELEASE_DIR}/hexmob.win-${TAG}-build.tgz"
                print -n "\nPreparing HEXMOB release files at ${RELEASE_DIR} ... "
                [[ -d ${RELEASE_DIR} ]] && rm -f ${RELEASE_DIR}/*
                [[ ! -d ${RELEASE_DIR} ]] && mkdir ${RELEASE_DIR}
                eval ${TAR} czf "${RELEASE_TGZ}" ${BUILD_DIR}
                print "Done!"

                print "\nLIVE DEPLOYMENT COMPLETED."
                echo -n "gpg --yes -b ${RELEASE_TGZ}" | pbcopy
                print "\nRemember to sign the release tarbal: \"gpg --yes -b ${RELEASE_TGZ}\" [copied to clipboard]"
                ;;
        esac
        ;;

    (*)
        print "Deploying to dev target ..."
        DEPLOY_TARGET=dev TARGET=tsa _build
        ;;
esac

