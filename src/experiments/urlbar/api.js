/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global ExtensionAPI, ExtensionCommon */

import KeywordTreeProvider from "./KeywordTreeProvider.js";

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  Preferences: "resource://gre/modules/Preferences.jsm",
  Services: "resource://gre/modules/Services.jsm",
  UrlbarProviderExtension: "resource:///modules/UrlbarProviderExtension.jsm",
});

XPCOMUtils.defineLazyGetter(
  this,
  "defaultPreferences",
  () => new Preferences({ defaultBranch: true })
);

/* global defaultSuggestedIndex */
// TODO: For some reason -1 as a default value is confusing eslint.
XPCOMUtils.defineLazyPreferenceGetter(
  this,
  "defaultSuggestedIndex",
  "extension.quick-suggest.suggestedIndex",
  -1
);

XPCOMUtils.defineLazyPreferenceGetter(
  this,
  "maxSearchResults",
  "browser.urlbar.maxRichResults",
  10
);

let treeProvider = new KeywordTreeProvider();

// TODO: Need a window reference to use performance.now I think.
async function time(fun) {
  let t0 = Date.now();
  let res = await fun();
  console.log(`fun took ${Date.now() - t0} milliseconds.`);
  return res;
}

this.experiments_urlbar = class extends ExtensionAPI {
  onStartup() {
    Services.tm.dispatchToMainThread(() => {
      time(() => treeProvider.load(this.extension.rootURI));
    });
  }
  getAPI(context) {
    return {
      experiments: {
        urlbar: {
          matchSearchTerm: async phrase => {
            let result = await time(() => treeProvider.query(phrase));
            if (result) {
              if (defaultSuggestedIndex == -1) {
                result.suggestedIndex = maxSearchResults - 1;
              } else {
                result.suggestedIndex = defaultSuggestedIndex;
              }
            }
            return result;
          },
          onViewUpdateRequested: new ExtensionCommon.EventManager({
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
