/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["KeywordTree"];

const RESULT_KEY = "_result";

class KeywordTree {
  constructor() {
    // Store results in a nested map keyed by a single character.
    this.tree = new Map();
  }

  set(keyword, term) {
    let tree = this.tree;
    for (let x = 0, c = ""; (c = keyword.charAt(x)); x++) {
      let child = tree.get(c) || new Map();
      tree.set(c, child);
      tree = child;
    }
    // When we using real data we want to check that we only
    // have unique keywords.
    /*if (tmp.get(RESULT_KEY)) {
      console.warn(`adding keyword "${phrase}" for term: "${term}" already exists for term: "${tmp.get(RESULT_KEY)}"`);
    }*/
    tree.set(RESULT_KEY, term);
  }

  get(phrase) {
    let tree = this.tree;
    for (let x = 0, c = ""; (c = phrase.charAt(x)); x++) {
      tree = tree.get(c);
      if (!tree) {
        return null;
      }
    }
    return tree.get(RESULT_KEY);
  }
}
