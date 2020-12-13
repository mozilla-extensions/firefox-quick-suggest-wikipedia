/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global it */

import * as assert from "assert";

import KeywordTree from "../../src/experiments/urlbar/KeywordTree.js";

let data = [
  {
    term: "helzo foo",
    keywords: ["hel", "helz", "helzo", "helzo f", "helzo fo"],
  },
  {
    term: "helzo bar",
    keywords: ["helzo ", "helzo b", "helzo ba"],
  },
];

function basicChecks(tree) {
  assert.equal(tree.get("nomatch"), null);
  assert.equal(tree.get("he"), null);
  assert.equal(tree.get("helzo"), "helzo foo");
  assert.equal(tree.get("helzo "), "helzo bar");
  assert.equal(tree.get("helzo foo"), "helzo foo");
  assert.equal(tree.get("helzo b"), "helzo bar");
  assert.equal(tree.get("helzo bar"), "helzo bar");
}

function createTree() {
  let tree = new KeywordTree();

  for (let { term, keywords } of data) {
    keywords.forEach(keyword => tree.set(keyword, term));
    tree.set(term, term);
  }
  return tree;
}

it("basic test", () => {
  basicChecks(createTree());
});

it("test serialisation", () => {
  let str = JSON.stringify(createTree().toJSON());
  let newTree = new KeywordTree();
  newTree.fromJSON(JSON.parse(str));
  basicChecks(newTree);
});

it("test flatten", () => {
  let tree = createTree();
  tree.flatten();

  assert.deepEqual(
    {
      he: {
        lzo: {
          "^": "helzo foo",
          " ": {
            "^": "helzo bar",
            foo: { "^": "helzo foo" },
            bar: { "^": "helzo bar" },
          },
        },
      },
    },
    tree.toJSON()
  );
  basicChecks(tree);
});

it("test reserved character", () => {
  let tree = createTree();
  try {
    tree.set("helzo^foo");
    assert.ok(false, "Should thrown when using reserved characters");
  } catch (e) {
    assert.ok(true, "Did throw when using reserved characters");
  }
});

it("test duplicate keywords", () => {
  let tree = createTree();
  tree.set("foobar", "result1");
  try {
    tree.set("foobar", "result2");
    assert.ok(false, "Should thrown when using duplicate keyword");
  } catch (e) {
    assert.ok(true, "Did throw when using duplicate keyword");
  }
});
