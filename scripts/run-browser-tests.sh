#!/bin/bash

if [ -z "$GECKO_PATH" ]
then
    echo "Requires GECKO_PATH to be set to an m-c checkout"
    exit
fi

npm run build:dist

cp -R tests/moz.build $GECKO_PATH/testing/extensions/moz.build
cp web-ext-artifacts/*.xpi $GECKO_PATH/testing/extensions/browser/
cp -R tests/browser/ $GECKO_PATH/testing/extensions/browser/

cd $GECKO_PATH

./mach mochitest -f browser testing/extensions/browser/browser_test.js
