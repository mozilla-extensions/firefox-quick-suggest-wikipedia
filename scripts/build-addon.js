#!/usr/bin/env node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import webExt from "web-ext";

import { rollup, watch } from "rollup";
import copy from "rollup-plugin-copy";

const OUTDIR = "public/addon-build";

let inputOptions = {
  input: "src/experiments/urlbar/api.js",
  context: "this",
  plugins: [
    copy({
      targets: [
        {
          src: "src/experiments/urlbar/schema.json",
          dest: OUTDIR
        },
        {
          src: process.env.DATA_FILE || "data/data-default.json",
          dest: `${OUTDIR}/data`,
          rename: "suggestions.json"
        },
        { src: "src/manifest.json", dest: OUTDIR },
        { src: "src/*.js", dest: OUTDIR },
        { src: "src/icons/*", dest: `${OUTDIR}/icons` },
      ]
    })
  ]
};

let outputOptions = { file: `${OUTDIR}/api.js` };

async function _build() {
  let bundle = await rollup(inputOptions);
  let result = await bundle.write(outputOptions);
}

async function _watch() {
  let extensionRunner = await webExt.cmd.run({
    firefox: "nightly",
    sourceDir: `${process.env.PWD}/${OUTDIR}/`,
    noInput: true,
    noReload: true,
    browserConsole: true,
    pref: { "extensions.experiments.enabled" : true }
  });
  inputOptions.output = outputOptions;
  let watcher = watch(inputOptions);
  watcher.on("event", (event, err) => {
    if (event.code === "ERROR") {
      console.error(event.error);
      process.exit();
    }
    if (event.code === "END") {
      extensionRunner.reloadAllExtensions();
    }
  });
}

(async function() {
  if (process.argv[2] === "watch") {
    await _watch();
  } else {
    await _build();
  }
})();
