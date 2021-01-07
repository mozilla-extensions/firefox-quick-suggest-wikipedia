
import fs from "fs";
import fetch from "node-fetch";
import KeywordTree from "../src/experiments/urlbar/keywordTree.js";
import parse from "parse-wikitext";

const WIKI_URL = "https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia.org/all-access/2020/12/21";

// TODO: Duplicating this way too many times needlessly, should stop it.
const WIKI_ICON = "data:image/x-icon;base64,AAABAAIAICAQAAEABADuAQAAJgAAABAQEAABAAQAYAEAABQCAACJUE5HDQoaCgAAAA1JSERSAAAAIAAAACAIBgAAAHN6evQAAAG1SURBVFiF7ZfNccQgDIVJJi2oBlXgGqjBBdADJdACTbgS36mBJqQcMnLEj9jsXpzD7gwnGenj8SR7P5iZ3Y2/zzuLvwH+BcDXzR68X4HbARwR8bZt7Jwb1r7vTERMRIyITQwAOOfMRMQpJQaAJi6xnPOwV+d2UqDW2iSptV7FZYUQrvh5nk2slMLOOUZELqUMe/d9vwrr3E4/lFK6ChzHMSSptV7xEEITO47D3CcAADAczPUFRIVt26aJYoxTlRCRvffTPQKeUhpiblXAUkEgY4zN6ftr0Tlnp58CaJmtE/UqIGJj2H4BwHBlJoA2jHNuaiitgjw7e06rY8WnAOLovhUtFazTEf20uKWkCUBE7L1ftuSqI2Sd57nsjCWASKfNNrtbGUrW3LC66SGAyGcV0ICzFhOFZCK+BKCL9AUQkUMIlwkBoInLeF7lfwjQyzxztjashgSA6eB5GiDnPLxg5PS9YQVSAGe+eBpA9zwiTvu6vyrv/bI1nwIganvemg39K90aPC8B6J63kmsVVoPnJQCi32+B1cyXD4/V4HkZoNbKMcalsUopf3K+Xh/vv2ZvgLsBvgEmf6Ud8idB7wAAAABJRU5ErkJggolQTkcNChoKAAAADUlIRFIAAAAQAAAAEAgGAAAAH/P/YQAAASdJREFUOI3FkzGKwzAQRX9M7iDnBGqDywhBSCeUi/gQKdL4BiGtK5Fe1zDug3vjMieYv5WEtWG3ycIKBvQ16I/mDdqQJD5Y1SeX/8Rg+2EHqMZxhLUWVVXhfr8DALz3WS/LAmstrLVYlgWPxwO73Q7ee0zTBIgI53kmAMYYmbTWmrfbjSJC5xzneaaIUERojMl7pI1zrkiEEKiUYoyRXdcV58m4MBiGgQA4DENOaq2ptc46FVrrPIWmaeCcw+VyyYBOpxNer1fW4zhiv9+XFNduMUYC4PP5zNWUUgwhUETYtm3BQkS4XZt576G1Rt/3OBwOOJ/PsNbier3ieDwCAOq6/vkFCRKA3GuakDGm4PMGcR1KqYJ027Zv8H41SAzW8b33FJt//41fMtqn5156WuIAAAAASUVORK5CYII="

// Hardcoded list of articles to ignore
const IGNORE_LIST = [
  "Main_Page",
  "Special:Search",
  "VUI_–_202012/01",
];

// Minimum number of characters before we can match
const MIN_CHAR_MATCH = 3;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

(async function() {

  let tree = new KeywordTree();
  let doc = {
    records: {},
    options: {
      icon: WIKI_ICON
    }
  };

  let req = await fetch(WIKI_URL);
  let json = await req.json();
  let articles = json.items[0].articles;

  for (let i = 0; i < articles.length; i++) {
    let id = articles[i].article;
    if (IGNORE_LIST.includes(id)) {
      continue;
    }
    let url = `https://api.wikimedia.org/core/v1/wikipedia/en/page/${encodeURIComponent(id)}`;
    let file = `data/wiki/${encodeURIComponent(id)}.json`;
    try {
      let data;
      if (!fs.existsSync(file)) {
        console.log("Fetching", url, i);
        let req = await fetch(url);
        data = await req.json();
        // Fancy rate limiting.
        await sleep(2000);
        if (!data.id) {
          console.error('invalid', data);
          throw data;
        }
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
      } else {
        data = JSON.parse(fs.readFileSync(file));
      }
      let title = data.title;
      let keyword = title.replace(/-/g, " ").replace(/_/g, " ").toLowerCase();

      let index = data.source.indexOf("{{Short description|");
      if (index == -1) {
        index = data.source.indexOf("{{short description|");
      }
      let description;
      if (index == -1) {
        description = title;
      } else {
        let t = data.source.slice(index + 20);
        index = t.indexOf("}}");
        description = t.slice(0, index);
      }

      doc.records[i + ""] = {
        title,
        description,
        term: id,
        url: `https://en.wikipedia.com/wiki/${id}`
      };
      for (let g = MIN_CHAR_MATCH; g < keyword.length; g++) {
        tree.set(keyword.slice(0, keyword.length - g + MIN_CHAR_MATCH), i);
      }
    } catch (e) {
      console.error(`fetching "${url}" failed`, e);
    }
  }

  tree.flatten();

  doc.tree = tree.toJSON();

  fs.writeFileSync(
    "data/data-wikipedia.json",
    JSON.stringify(doc, null, 2)
  );

  console.log("Wrote file: data/data-wikipedia.json");

})();
