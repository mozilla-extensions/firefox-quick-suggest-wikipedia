/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

import KeywordTree from "./KeywordTree.js";

Cu.importGlobalProperties(["fetch"]);

class KeywordTreeProvider {
  constructor() {
    this.tree = new KeywordTree();
    this.results = new Map();
    this.iconPath = null;
    this.title = "";
  }

  async load({ extension }) {
    let data = await KeywordTreeProvider.fetchJSON(
      extension,
      "data/data-processed-50000.json"
    );

    this.title = data.title;
    this.results = data.records;
    this.tree.fromJSON(data.tree);
    this.iconPath = extension.baseURI.resolve("icons/favicon.ico");
  }

  async query(phrase) {
    let index = this.tree.get(phrase);
    if (!index || !(index in this.results)) {
      return null;
    }
    let result = this.results[index];
    return {
      title: this.title.replace("%s", result.term),
      url: result.url,
      icon: this.iconPath,
    };
  }

  static async fetchJSON(extension, path) {
    let fullPath = extension.baseURI.resolve(path);
    let req = await fetch(fullPath);
    return req.json();
  }
}

export default KeywordTreeProvider;
