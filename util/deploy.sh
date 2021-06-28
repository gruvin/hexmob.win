#!/bin/zsh
GIT=/usr/local/bin/git
GPG=/usr/local/bin/gpg
RSYNC=/usr/bin/rsync
SCP=/usr/bin/scp
TAR=/usr/bin/tar
DEST_HEXMOB='hexmob:~/public_html' 
DEST_TSA='tsa:~/go.tshare.app' 

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

                # do double branding stuff (two builds)
                cp public/index.html public/index.html-orig

                echo "BUILDING HEXMOB VERSION"
                cp public/index-tsa.html public/index.html
                yarn build
                if [ -d build-tsa ]; then rm -rf build-tsa; fi
                mv build/ build-tsa
                mkdir build
                
                echo "BUILDING TSHAREAPP VERSION"
                cp public/index-hexmob.html public/index.html
                yarn build
                cp public/index.html-orig public/index.html
                rm -f public/index.html-orig

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

echo "RSYNC: sending build/* => ${DEST_HEXMOB}" 
$RSYNC -r --exclude=.htaccess --exclude=.DS_Store --exclude=.Trashes --delete 'build/' ${DEST_HEXMOB}

echo "RSYNC: sending build-tsa/* => ${DEST_TSA}" 
$RSYNC -r --exclude=.htaccess --exclude=.DS_Store --exclude=.Trashes --delete 'build-tsa/' ${DEST_TSA}

echo "DONE"

git checkout dev
git stash pop

exit 0

