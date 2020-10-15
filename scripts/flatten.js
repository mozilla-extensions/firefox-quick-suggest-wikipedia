import fs from "fs";

import KeywordTree from "../src/experiments/urlbar/keywordTree.js";

let data = fs.readFileSync("src/data/data-keywords-50000.json");
let json = JSON.parse(data);

let tree = new KeywordTree();
let doc = {
  title: "PalmTree - view all \"%s\"",
  records: {}
};

json.forEach(({ term, url, keywords }, i) => {
  doc.records[i] = {
    term,
    url: `http://example.org?q=${term}`
  }
  keywords.forEach((keyword) => tree.set(keyword, i));
  tree.set(term, i);
});

tree.flatten();

doc.tree = tree.toJSON();

fs.writeFileSync(
  "src/data/data-processed-50000.json",
  JSON.stringify(doc, null, 2)
);

console.log("File written");
