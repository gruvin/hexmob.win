#!/bin/bash
export REACT_APP_INFURA_ID="ba82349aaccf4a448b43bf651e4d9145"
export REACT_APP_PORTIS_ID="e55eff64-770e-4b93-9377-fb42791b5738"
yarn build && rsync -vr --delete build/* hexmob:~/public_html
