#!/bin/bash
yarn build && rsync -vr --delete build/* hexmob:~/public_html
