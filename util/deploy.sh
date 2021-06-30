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

                # do dual branding stuff (two builds)
                cp public/index.html public/index.html-orig
                cp src/theme.scss src/theme.scss-orig

                echo "Building go.TShare.app version ..."
                cp public/index-tsa.html public/index.html
                cp src/theme-tsa.scss src/theme.scss
                yarn build
                if [ -d build-tsa ]; then rm -rf build-tsa; fi
                mv build/ build-tsa
                echo "Done."
                
                echo "Building hexmob.win version"
                cp public/index-hexmob.html public/index.html
                cp src/theme-hexmob.scss src/theme.scss
                yarn build
                echo "Done."

                mv public/index.html-orig public/index.html
                mv src/theme.scss-orig src/theme.scss
                echo "Dual build completed."

                echo "Constructing release files in ./release/ ..."
                RELEASE_TGZ="release/hexmob.win-${TAG}-build.tgz"
                if [ ! -d release ]; then mkdir release; fi
                rm -f release/*
                eval $TAR czf "${RELEASE_TGZ}" build/
                echo "LIVE DEPLOYMENT COMPLETED."
                echo "Remember to sign release tarbal: gpg --yes -b ${RELEASE_TGZ}"
                ;;
            esac

            echo "RSYNC: sending build/* => ${DEST_HEXMOB}" 
            $RSYNC -r --exclude=.htaccess --exclude=.DS_Store --exclude=.Trashes --delete 'build/' ${DEST_HEXMOB}

            echo "RSYNC: sending build-tsa/* => ${DEST_TSA}" 
            $RSYNC -r --exclude=.htaccess --exclude=.DS_Store --exclude=.Trashes --delete 'build-tsa/' ${DEST_TSA}

        ;;
    *) # dev deploy by default
        echo "Building test production set for DEV server"
        DEST_HEXMOB='hexmob:~/dev.hexmob.win' 
        echo "RSYNC: sending build/* => ${DEST_HEXMOB}" 
        $RSYNC -r --exclude=.htaccess --exclude=.DS_Store --exclude=.Trashes --delete 'build/' ${DEST_HEXMOB}
        yarn build 
        ;;
esac


echo "DONE"

git checkout dev
git stash pop

exit 0

