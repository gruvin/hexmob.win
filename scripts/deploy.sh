#!/bin/zsh
GIT=/usr/local/bin/git
GPG=/usr/local/bin/gpg
RSYNC=/usr/local/bin/rsync
RSYNC_ARGS=--exclude='.ht*' --exclude='.DS*' --exclude='.Trashes'
SCP=/usr/bin/scp
TAR=/usr/bin/tar
BUILD_DIR="./dist/" # must include trailing / for rsync !
DEST_DEV='hexmob:~/dev.hexmob.win' 
DEST_HEXMOB='hexmob:~/public_html' 
DEST_TSA='tsa:~/go.tshare.app' 
autoload throw catch

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
        [[ -e "./${F}${SLASH}" ]] && $RSYNC -r --delete "./${F}${SLASH}" "./${FILE}${SLASH}" || throw ''
        [[ -e "./${F}" ]] && rm -rf "./${F}" || throw ''
    done
    unset TARGET
    unset DEST
    ${GIT} checkout dev  > /dev/null 2>&1 
    ${GIT} stash pop  > /dev/null 2>&1 
}

TRAPINT() {
  setopt localoptions err_exit
  print "\nCaught SIGINT. Run away and live to fight another day! :P"
  _cleanup
  exit 4
}

# @args: TARGET DEST
_build() {
    {        
        [[ "$TARGET" == "" ]] && throw 'TARGET not set'
        [[ "$DEST" == "" ]] && throw 'DEST not set'

        print "\nBuilding production set for ${TARGET} ( => ${DEST})\n"
        [[ "$TARGET" == "tsa" ]] && ( /bin/cp ./public/seo/favicon.ico ~/Desktop/favicon_1.ico || throw '' )
        # dual branding stuff
        for FILE in $FILES; do
            SLASH=""
            [[ -d "$FILE" ]] && SLASH="/"
            ${RSYNC} -r --delete "${FILE}${SLASH}" "./master.pub/${FILE}-orig" || throw ''
            ${RSYNC} -r --delete "./master.pub/${FILE}.${TARGET}${SLASH}" "./${FILE}${SLASH}" || throw ''
        done
        [[ "$TARGET" == "tsa" ]] && ( /bin/cp ./public/seo/favicon.ico ~/Desktop/favicon_2.ico || throw '' )
        
        # build
        yarn build || throw ''
        print "BUILD DONE"

        print "RSYNCing ${BUILD_DIR} => ${DEST}" 
        ${RSYNC} ${RSYNC_APPLE_ARGS} -rn  --delete ${BUILD_DIR} ${DEST} || throw ''

    } always {
        if catch '*'; then
            print "D'oh! CAUGHT: [$CAUGHT]"
            _cleanup
            [[ "$TARGET" == "tsa" ]] && ( /bin/cp public/seo/favicon.ico ~/Desktop/favicon_3.ico || throw HUH )
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
                TARGET=tsa DEST=${DEST_TSA} _build
                TARGET=hexmob DEST=${DEST_HEXMOB} _build

                # Create release tarbal for gpg signing and upload to repo 'official release tag'
                RELEASE_DIR="./release"
                RELEASE_TGZ="${RELEASE_DIR}/hexmob.win-${TAG}-build.tgz"
                print -n "Preparing HEXMOB release files at ${RELEASE_DIR} ... "
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
        print "\nBuilding test production set for ${TARGET} ( => ${DEST_DEV})\n"
        _build ${TARGET} ${DEST_DEV}
        ;;
esac

