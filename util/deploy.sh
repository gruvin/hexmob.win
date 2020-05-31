#!/bin/zsh
GIT=/usr/local/bin/git
GPG=/usr/local/bin/gpg
RSYNC=/usr/bin/rsync
TAR=/usr/bin/tar

source LOAD_ENV
if [[ "${NODE_ENV}" != "${REACT_APP_NODE_ENV}" ]]; then 
    echo "ERROR: REACT_APP_NODE_ENV didn't get set by LOAD_ENV"
    exit 1
fi
if [[ ! -d build/ ]]; then
    echo "ERROR: Need to be in root folder cotaining build/ dir"
    exit 2
fi
case "$NODE_ENV" in
    development)
        echo "Building production TEST for DEV server"
        DEST='hexmob:~/dev.hexmob.win' 
        yarn build 
        ;;
    production)
        read AMSURE\?"PRODUCTION deployment! Enter \"yes\" to continue: "
        if [[ ! "yes" = "$AMSURE" ]]; then echo "Didn't think so." ; exit 0 ; fi
        DEST='hexmob:~/public_html' 
        echo "Enter release version tag for this PRODUCTION build"
        read TAG\?"eg. v0.2.3B -- this should match a master branch git tag: "
        CHECKOUT_CMD="$GIT stash && $GIT checkout ${TAG}"
        read -k1 YN\?"OK to execute '${CHECKOUT_CMD}'? [Y/n]: "
        case $YN in
            [Nn])
                echo "\nAborted"
                exit 0
                ;;
            *) 
                eval ${CHECKOUT_CMD}
                if [[ $? -ne 0 ]]; then echo "\nWell that went badly :/\n"; exit -1; fi
                echo "Building ${TAG} for production server"
                yarn build 
                RELEASE="release/hexmob.win-${TAG}-build.tgz"
                if [[ ! -d release ]]; then mkdir release; fi
                echo "Creating ${RELEASE}"
                eval $TAR czf "${RELEASE}" build/
                echo "GPG Signing ${RELEASE} => ${RELEASE}.asc"
                eval $GPG --yes -b ${RELEASE}
                if [[ ! -f "${RELEASE}.asc" ]]; then
                    echo "Signing failed. Use 'gpg -b ${RELEASE}' to try again."
                    exit 3
                fi
                ;;
            esac
        ;;
    *) print "Invalid NODE_ENV (${NODE_ENV})" && exit 1
esac

echo "RSYNC: (dry run) sending build/* => ${DEST}" 
$RSYNC -n -r --delete 'build/' ${DEST}

echo "DONE"
exit 0

