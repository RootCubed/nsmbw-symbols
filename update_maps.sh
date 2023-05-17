#!/bin/sh

# Check if NSMBW-Maps has been cloned yet
if [ ! -d "NSMBW-Maps" ]; then
    git clone https://github.com/RootCubed/NSMBW-Maps.git
fi

node makeCHNMap.js

cp symbols_CHN.map NSMBW-Maps/

cd NSMBW-Maps

if [ -n "$(git status --porcelain)" ]; then
    git add .
    git commit -m "Add new symbols" --author="nsmbw-map-bot <liam@rootcubed.dev>"
    git push
fi
