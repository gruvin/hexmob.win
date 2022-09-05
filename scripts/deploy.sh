#!/bin/zsh
GIT=/usr/local/bin/git
GPG=/usr/local/bin/gpg
RSYNC=/usr/bin/rsync
SCP=/usr/bin/scp
TAR=/usr/bin/tar
BUILD_DIR="./dist/" # must include trailing / for rsync !
DEST_DEV='hexmob:~/dev.hexmob.win' 
DEST_HEXMOB='hexmob:~/public_html' 
DEST_TSA='tsa:~/go.tshare.app' 
autoload throw catch
{
    if [[ ! ( -f ./index.html && -d ./master.pub && -d ./src ) ]]; then
        throw E_WRONG_DIR
    fi

    FILES=( 'index.html' 'src/theme.scss' 'public')
    TARGET="hexmob"

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
                    cp src/assets/favicon-96x96.png src/assets/favicon-96x96.png-orig

                    echo "Building go.TShare.app version ..."
                    cp public/index-tsa.html public/index.html
                    cp public/tsa/favicon-96x96.png src/assets/
                    cp src/theme-tsa.scss src/theme.scss
                    yarn build
                    if [ -d build-tsa ]; then rm -rf build-tsa; fi
                    mv build/ build-tsa
                    mkdir build
                    echo "Done."
                    
                    echo "Building hexmob.win version"
                    cp public/index-hexmob.html public/index.html
                    cp public/hexmob/favicon-96x96.png src/assets/
                    cp src/theme-hexmob.scss src/theme.scss
                    yarn build
                    echo "Done."

                    mv public/index.html-orig public/index.html
                    mv src/theme.scss-orig src/theme.scss
                    mv src/assets/favicon-96x96.png-orig src/assets/favicon-96x96.png
                    echo "Dual build completed."

                    echo "RSYNC: sending build/* => ${DEST_HEXMOB}" 
                    $RSYNC -r --exclude='.ht*' --exclude='.DS*' --exclude='.Trashes' --delete 'build/' ${DEST_HEXMOB}

                    echo "RSYNC: sending build-tsa/* => ${DEST_TSA}" 
                    $RSYNC -r --exclude='.ht*' --exclude='.DS*' --exclude='.Trashes' --delete 'build-tsa/' ${DEST_TSA}

                    echo "Preparing HEXMOB release files in ./release/ ..."
                    RELEASE_TGZ="release/hexmob.win-${TAG}-build.tgz"
                    if [ ! -d release ]; then mkdir release; fi
                    rm -f release/*
                    eval $TAR czf "${RELEASE_TGZ}" build/

                    echo "LIVE DEPLOYMENT COMPLETED."
                    echo "Remember to sign release tarbal: gpg --yes -b ${RELEASE_TGZ}"

                    git checkout dev
                    git stash pop
                    ;;
            esac
            ;;

        *) # dev.hexmob.win deploy by default
            echo -e "\nBuilding test production set for dev.hexmob.win\n"
            # do dual branding stuff (two builds)
            for FILE in $FILES; do
                SLASH=""
                [[ -d "$FILE" ]] && SLASH="/"
                $RSYNC -r --delete "${FILE}${SLASH}" "./master.pub/${FILE}-orig" || throw ''
                $RSYNC -r --delete "./master.pub/${FILE}.${TARGET}${SLASH}" "./${FILE}${SLASH}" || throw ''
            done

            yarn build || throw ''

            echo "RSYNC: sending ${BUILD_DIR}/* to ${DEST_DEV}" 
            $RSYNC -r --exclude='.ht*' --exclude='.DS*' --exclude='.Trashes' --delete ${BUILD_DIR} ${DEST_DEV} || throw ''
            ;;
    esac

} always {
    # catch is a function. catch '*' with set $CAUGHT if there was an error or throw above and return status 1
    if catch '*'; then
        case $CAUGHT in
            E_WRONG_DIR)
                echo "ERROR: Needs to run from project root"
            ;;
            *)
                echo "D'oh! $CAUGHT"
                throw ''
            ;;
        esac
    fi
    
    for FILE in $FILES; do
        F="./master.pub/$FILE-orig" 
        SLASH=""
        [[ -d "$F" ]] && SLASH="/"
        $RSYNC -r --delete "./${F}${SLASH}" "./${FILE}${SLASH}" || throw ''
        [ -e "./${F}" ] && rm -rf "./${F}" || throw ''
    done

    [[ "$CAUGHT" == "" ]] && echo "DONE."

}
