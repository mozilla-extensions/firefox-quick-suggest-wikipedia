/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global ExtensionAPI, ExtensionCommon */

"use strict";

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  Preferences: "resource://gre/modules/Preferences.jsm",
  QueryScorer: "resource:///modules/UrlbarProviderInterventions.jsm",
  UrlbarProviderExtension: "resource:///modules/UrlbarProviderExtension.jsm",
});

XPCOMUtils.defineLazyGetter(
  this,
  "defaultPreferences",
  () => new Preferences({ defaultBranch: true })
);

Cu.importGlobalProperties(["fetch"]);

let { EventManager } = ExtensionCommon;

// TODO: Need a window reference to use performance.now I think.
async function time(fun) {
  let t0 = Date.now();
  let res = await fun();
  let t1 = Date.now();
  console.log(`fun took ${Date.now() - t0} milliseconds.`);
  return res;
}

// Uses the internal firefox QueryScorer used for interventions.
// which shows for example a restart button when the user searches
// for "restart firefox". Issues are:

// 1. Matches when user has typed longer than suggestion
// "to kill a mockingbi" matches the term "mto"

// 2. Doesnt match when a longer keyword match exists
// "kids" doesnt match because "kids books" does

// 3. Doesnt have much recall
// "the most fun we ever h" wont match "the most fun we ever had"
class QueryScorerProvider {
  qs = new QueryScorer()

  async load({ extension }) {
    let path = extension.baseURI.resolve("data/data-plain.json");
    let req = await fetch(path);
    let data = await req.json();
    data.forEach(({ term, url }) => {
      this.qs.addDocument({ id: url, phrases: [term] });
    });
  }

  async query(phrase) {
    let results = this.qs.score(phrase);
    if (results[0].score != Infinity) {
      return { url: results[0].document.id };
    }
    return null;
  }
};

// A super simple in memory mapping of precompiled keywords to result
// (test data set just uses prefixes).

// 1. Doesnt scale, 5000 results seems reasonable in memory (still trying
// to determine exact impact). But there is obviously some limit to
// how many keywords can be added. (TODO: find limit)
// We can release memory by storing in IndexedDB, but that vastly
// increases complexity, dealing with updates etc
class KeywordsProvider {
  matches = new Map()
  results = new Map()

  async load({ extension }) {
    let path = extension.baseURI.resolve("data/data-keywords.json");
    let req = await fetch(path);
    let data = await req.json();
    data.forEach(({ term, url, keywords }) => {
      keywords.forEach(keyword => this.matches.set(keyword, term));
      this.matches.set(term, term);
      this.results.set(term, url);
    });
  }

  async query(phrase) {
    let term = this.matches.get(phrase);
    if (!term) return null;
    return { url: this.results.get(term) };
  }
};

//let mode = "queryscorer";
let mode = "keywords";

let loader = {
  load: async context => time(() => loader[mode].load(context)),
  query: async phrase => time(() => loader[mode].query(phrase)),
  queryscorer: new QueryScorerProvider(),
  keywords: new KeywordsProvider()
};

this.experiments_urlbar = class extends ExtensionAPI {
  getAPI(context) {

    // Do the initial loading of data, probably a better place for this?
    loader.load(context);

    return {
      experiments: {
        urlbar: {
          matchSearchTerm: (phrase) => {
            return loader.query(phrase);
          },
          onViewUpdateRequested: new EventManager({
            context,
            name: "experiments.urlbar.onViewUpdateRequested",
            register: (fire, providerName) => {
              let provider = UrlbarProviderExtension.getOrCreate(providerName);
              provider.setEventListener("getViewUpdate", result => {
                return fire.async(result.payload).catch(error => {
                  throw context.normalizeError(error);
                });
              });
              return () => provider.setEventListener("getViewUpdate", null);
            },
          }).api(),
        },
      },
    };
  }

  onShutdown() {
    // Reset the default prefs.  This is necessary because
    // ExtensionPreferencesManager doesn't properly reset prefs set on the
    // default branch.  See bug 1586543, bug 1578513, bug 1578508.
    if (this._initialDefaultPrefs) {
      for (let [pref, value] of this._initialDefaultPrefs.entries()) {
        defaultPreferences.set(pref, value);
      }
    }
  }
};
