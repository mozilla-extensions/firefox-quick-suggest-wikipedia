/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import copy from "rollup-plugin-copy";

export default {
  input: "src/experiments/urlbar/api.js",
  output: { file: "public/addon-build/api.js" },
  context: "this",
  plugins: [
    copy({
      targets: [
        {
          src: "src/experiments/urlbar/schema.json",
          dest: "public/addon-build"
        },
        { src: "src/manifest.json", dest: "public/addon-build" },
        { src: "src/*.js", dest: "public/addon-build" },
        { src: "src/data/*", dest: "public/addon-build/data" },
        { src: "src/icons/*", dest: "public/addon-build/icons" },
      ]
    })
  ]
};
