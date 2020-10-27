import fs from "fs";

import KeywordTree from "../src/experiments/urlbar/keywordTree.js";

const TEST_DATA = [
  {
    "term": "frabbits",
    "keywords": ["frab"]
  }
]

const TEST_VISIT_URL = "http://mochi.test:8888/browser/testing/extensions/browser/qs_visit.sjs"

let tree = new KeywordTree();
let doc = {
  title: "QuickSuggest Test - view all \"%s\"",
  records: {}
};

TEST_DATA.forEach(({ term, keywords }, i) => {
  // Ensure object keys are strings.
  i += "";
  doc.records[i] = {
    term,
    url: `${TEST_VISIT_URL}?q=${term}`
  };
  keywords.forEach((keyword) => tree.set(keyword, i));
  tree.set(term, i);
});

tree.flatten();

doc.tree = tree.toJSON();

fs.writeFileSync(
  "data/data-test.json",
  JSON.stringify(doc, null, 2)
);

console.log("Wrote file: data/data-test.json");
