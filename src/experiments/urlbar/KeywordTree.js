/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * This is an implementation of a Map based Tree. We can store
 * multiple keywords that point to a single term, for example:
 *
 *   tree.add("headphones", "headphones");
 *   tree.add("headph", "headphones");
 *   tree.add("earphones", "headphones");
 *
 *   tree.get("headph") == "headphones"
 *
 * The tree can store multiple prefixes to a term efficiently
 * so ["hea", "head", "headp", "headph", "headpho", ...] wont lead
 * to duplication in memory. The tree will only return a result
 * for keywords that have been explcitly defined and not attempt
 * to guess based on prefix.
 *
 * Once a tree have been build, it can be flattened with `.flatten`
 * the tree can then be serialised and deserialised with `.toJSON`
 * and `.fromJSON`.
 */

const RESULT_KEY = "^";

class KeywordTree {
  constructor() {
    this.tree = new Map();
  }

  set(keyword, term) {
    if (keyword.includes(RESULT_KEY)) {
      throw new Error(`"${RESULT_KEY}" is reserved`);
    }
    let tree = this.tree;
    for (let x = 0, c = ""; (c = keyword.charAt(x)); x++) {
      let child = tree.get(c) || new Map();
      tree.set(c, child);
      tree = child;
    }
    // Check for duplicated
    if (tree.get(RESULT_KEY)) {
      throw new Error(
        `"${keyword}" for term "${term}" already exists for term: "${tree.get(
          RESULT_KEY
        )}"`
      );
    }
    tree.set(RESULT_KEY, term);
  }

  get(phrase) {
    let tree = this.tree;
    /*eslint no-labels: ["error", { "allowLoop": true }]*/
    loop: while (phrase.length) {
      for (const [key, child] of tree.entries()) {
        // We need to check if key starts with phrase because we
        // may have flattened the key and so .get("hel") will need
        // to match index "hello", we will only flatten this way if
        // the result matches.
        if (phrase.startsWith(key) || key.startsWith(phrase)) {
          phrase = phrase.slice(key.length);
          if (!phrase.length) {
            return child.get(RESULT_KEY) || null;
          }
          tree = child;
          continue loop;
        }
      }
      return null;
    }
    return null;
  }

  // We flatten the tree by combining consecutive single branch keywords
  // with the same results into a longer keyword. so ["a", ["b", ["c"]]]
  // becomes ["abc"], we need to be careful that the result matches so
  // if a prefix search for "hello" only starts after 2 characters it will
  // be flattened to ["he", ["llo"]].
  flatten() {
    for (let key of Array.from(this.tree.keys())) {
      this._flatten(this.tree, key);
    }
  }

  _flatten(parent, key) {
    let tree = parent.get(key);
    let keys = Array.from(tree.keys()).filter(k => k != RESULT_KEY);
    let result = tree.get(RESULT_KEY);

    if (keys.length == 1) {
      let childKey = keys[0];
      let child = tree.get(childKey);
      let childResult = child.get(RESULT_KEY);

      if (result == childResult) {
        let newKey = key + childKey;
        parent.set(newKey, child);
        parent.delete(key);
        this._flatten(parent, newKey);
      } else {
        this._flatten(tree, childKey);
      }
    } else {
      for (let key of keys) {
        this._flatten(tree, key);
      }
    }
  }

  JSONToMap(obj) {
    let map = new Map();
    for (let key of Object.keys(obj)) {
      if (obj[key] instanceof Object) {
        map.set(key, this.JSONToMap(obj[key]));
      } else {
        map.set(key, obj[key]);
      }
    }
    return map;
  }

  fromJSON(json) {
    this.tree = this.JSONToMap(json);
  }

  toJSON(map = this.tree) {
    let tmp = {};
    for (let [key, val] of map) {
      if (val instanceof Map) {
        tmp[key] = this.toJSON(val);
      } else {
        tmp[key] = val;
      }
    }
    return tmp;
  }
}

export default KeywordTree;
