#!/bin/zsh
GIT=/usr/local/bin/git
GPG=/usr/local/bin/gpg
RSYNC=/usr/bin/rsync
TAR=/usr/bin/tar
DEST='hexmob:~/public_html' 
DEST_TSA='tsa:~/public_html' 

if [[ ! -d build/ ]]; then
    echo "ERROR: Need to be in root folder cotaining build/ dir"
    exit 2
fi

read -k1 DEPLOY_TYPE\?"Poduction or Dev deployment? [D/p]: "
case "$DEPLOY_TYPE" in
    [Pp])
        echo "\n"
        read AMSURE\?"PRODUCTION deployment! Enter \"yes\" to continue: "
        if [[ ! "yes" = "$AMSURE" ]]; then echo "Didn't think so." ; exit 0 ; fi
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
                echo "Building ${TAG} for production server deployment"
                export REACT_APP_VERSION="${TAG}"
                yarn build 
                RELEASE="release/hexmob.win-${TAG}-build.tgz"
                if [[ ! -d release ]]; then mkdir release; fi
                echo "Creating empty ${RELEASE} folder"
                rm -f ${RELEASE}/*
                eval $TAR czf "${RELEASE}" build/
                echo "Build done."
                echo "Release files are in release/ dir. REMEMBER TO SIGN: gpg --yes -b ${RELEASE}"
                ;;
            esac
        ;;
    *) # dev deploy by default
        echo "Building test production set for DEV server"
        DEST='hexmob:~/dev.hexmob.win' 
        yarn build 
        ;;
esac

echo "RSYNC: sending build/* => ${DEST}" 
$RSYNC -r --delete 'build/' ${DEST}

echo "RSYNC: sending build/* => ${DEST_TSA}" 
$RSYNC -r --delete 'build/' ${DEST_TSA}

echo "DONE"

git checkout dev
git stash pop

exit 0

