# Quick Suggest Experimental WebExtension

This repo contains tools to build a WebExtension used for Firefox
Quick Suggest experiments.

## Getting Started

To get up and running straight away:

    git clone https://github.com/daleharvey/quick-suggest-extension
    cd quick-suggest-extension
    npm install
    npm start

A browser instance should start with some test data, if you type
"to kill a" you should see a quick suggest result for
"To kill a mockingbird". When using `npm start` if you make any changes
to the extension source it will.

### Using custom data files.

You can set `DATA_FILE=/path/to/file` when running `npm run start` or `npm run build` to install a custom data file in the extension.

### Building data files.

The extension loads data from a local file and currently expects
the file to contain a tree that resolves specific keywords to
an ID and a map of ID's to a data object. this is subject to change
but [data/data-default.js](data/data-default.js) should
be an up to date example,

[scripts/flatten.js](scripts/flatten.js) is a test script used to
generate one of these files, it will likely need customised
depending on your input data.

## Testing

To test the extension:

 * `npm run lint` - Will run eslint and web-ext linting tests.
 * `npm run test:unit` - Will run unit tests.
 * `GECKO_PATH=/path/to/checkout npm run test:browser` - Will
    run the browser tests, requires `GECKO_PATH` to use the test runner.
