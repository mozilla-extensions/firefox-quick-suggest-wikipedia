#!/bin/bash

if [ -z "$GECKO_PATH" ]
then
    echo "Requires GECKO_PATH to be set to an m-c checkout"
    exit
fi


node ./scripts/build-test-data.js

DATA_FILE=./data/data-test.json npm run build

cp -R tests/moz.build $GECKO_PATH/testing/extensions/moz.build
cp web-ext-artifacts/*.xpi $GECKO_PATH/testing/extensions/browser/
cp -R tests/browser/ $GECKO_PATH/testing/extensions/browser/

cd $GECKO_PATH

./mach build
./mach mochitest -f browser testing/extensions/browser/browser_test.js
