import fs from "fs";

import KeywordTree from "../src/experiments/urlbar/keywordTree.js";

let data = fs.readFileSync("data/data-keywords-50000.json");
let json = JSON.parse(data);

let tree = new KeywordTree();
let doc = {
  options: {
    title: "QuickSuggest - view all \"%s\""
  },
  records: {}
};

json.forEach(({ term, url, keywords }, i) => {
  doc.records[i] = {
    term,
    url: `http://example.org?q=${term}`
  }
  try {
    keywords.forEach((keyword) => tree.set(keyword, i));
    tree.set(term, i);
  } catch (e) {}
});

tree.flatten();

doc.tree = tree.toJSON();

fs.writeFileSync(
  "data/data-default.json",
  JSON.stringify(doc, null, 2)
);

console.log("File written");
