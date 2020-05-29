#!/bin/bash
yarn build && rsync -vr --delete build/* hexmob:~/dev.hexmob.win
