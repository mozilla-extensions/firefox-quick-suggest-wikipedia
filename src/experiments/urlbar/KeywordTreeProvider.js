/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

import KeywordTree from "./KeywordTree.js";

Cu.importGlobalProperties(["fetch"]);

const SUGGESTIONS_PATH = "data/suggestions.json";

const DEFAULT_TITLE = 'View "%s"';
const DEFAULT_ICON = "icons/default.svg";

class KeywordTreeProvider {
  constructor() {
    this.tree = new KeywordTree();
    this.results = new Map();
    this.icon = null;
    this.title = "";
  }

  async load(root) {
    let url = root.resolve(SUGGESTIONS_PATH);
    let data = await KeywordTreeProvider.fetchJSON(url);
    this.results = data.records;
    this.tree.fromJSON(data.tree);

    this.title = data.options.title ?? DEFAULT_TITLE;
    this.icon = data.options.icon ?? root.resolve(DEFAULT_ICON);
  }

  async query(phrase) {
    let index = this.tree.get(phrase);
    if (!index || !(index in this.results)) {
      return null;
    }
    let result = this.results[index];
    let title = result.title || this.title;
    let d = new Date();
    let date = `${d.getFullYear()}${d.getMonth() +
      1}${d.getDate()}${d.getHours()}`;
    return {
      title: title.replace("%s", result.term),
      url: result.url.replace("%YYYYMMDDHH%", date),
      description: result.description,
      icon: result.icon || this.icon,
    };
  }

  static async fetchJSON(url) {
    let req = await fetch(url);
    return req.json();
  }
}

export default KeywordTreeProvider;
