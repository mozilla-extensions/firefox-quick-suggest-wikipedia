/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global ExtensionAPI, ExtensionCommon */

"use strict";

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyGlobalGetters(this, ["TextDecoder"]);

XPCOMUtils.defineLazyModuleGetters(this, {
  Preferences: "resource://gre/modules/Preferences.jsm",
  QueryScorer: "resource:///modules/UrlbarProviderInterventions.jsm",
  UrlbarProviderExtension: "resource:///modules/UrlbarProviderExtension.jsm",
  UrlbarResult: "resource:///modules/UrlbarResult.jsm",
  UrlbarView: "resource:///modules/UrlbarView.jsm",
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

    loader.load(context);

    return {
      experiments: {
        urlbar: {
          addDynamicResultType: (name, type) => {
            this._addDynamicResultType(name, type);
          },

          scorePhrase: (phrase) => {
            return loader.query(phrase);
          },

          addDynamicViewTemplate: (name, viewTemplate) => {
            this._addDynamicViewTemplate(name, viewTemplate);
          },

          engagementTelemetry: this._getDefaultSettingsAPI(
            "browser.urlbar.eventTelemetry.enabled"
          ),

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

    this._removeDynamicViewTemplates();
    this._removeDynamicResultTypes();
  }

  _getDefaultSettingsAPI(pref) {
    return {
      get: details => {
        return {
          value: Preferences.get(pref),

          // Nothing actually uses this, but on debug builds there are extra
          // checks enabled in Schema.jsm that fail if it's not present.  The
          // value doesn't matter.
          levelOfControl: "controllable_by_this_extension",
        };
      },
      set: details => {
        if (!this._initialDefaultPrefs) {
          this._initialDefaultPrefs = new Map();
        }
        if (!this._initialDefaultPrefs.has(pref)) {
          this._initialDefaultPrefs.set(pref, defaultPreferences.get(pref));
        }
        defaultPreferences.set(pref, details.value);
        return true;
      },
      clear: details => {
        if (this._initialDefaultPrefs && this._initialDefaultPrefs.has(pref)) {
          defaultPreferences.set(pref, this._initialDefaultPrefs.get(pref));
          return true;
        }
        return false;
      },
    };
  }

  // We use the following four properties as bookkeeping to keep track of
  // dynamic result types and view templates registered by extensions so that
  // they can be properly removed on extension shutdown.

  // Names of dynamic result types added by this extension.
  _dynamicResultTypeNames = new Set();

  // Names of dynamic result type view templates added by this extension.
  _dynamicViewTemplateNames = new Set();

  // Maps dynamic result type names to Sets of IDs of extensions that have
  // registered those types.
  static extIDsByDynamicResultTypeName = new Map();

  // Maps dynamic result type view template names to Sets of IDs of extensions
  // that have registered those view templates.
  static extIDsByDynamicViewTemplateName = new Map();

  /**
   * Adds a dynamic result type and includes it in our bookkeeping.  See
   * UrlbarResult.addDynamicResultType().
   *
   * @param {string} name
   *   The name of the dynamic result type.
   * @param {object} type
   *   The type.
   */
  _addDynamicResultType(name, type) {
    this._dynamicResultTypeNames.add(name);
    this._addExtIDToDynamicResultTypeMap(
      experiments_urlbar.extIDsByDynamicResultTypeName,
      name
    );
    UrlbarResult.addDynamicResultType(name, type);
  }

  /**
   * Removes all dynamic result types added by the extension.
   */
  _removeDynamicResultTypes() {
    for (let name of this._dynamicResultTypeNames) {
      let allRemoved = this._removeExtIDFromDynamicResultTypeMap(
        experiments_urlbar.extIDsByDynamicResultTypeName,
        name
      );
      if (allRemoved) {
        UrlbarResult.removeDynamicResultType(name);
      }
    }
  }

  /**
   * Adds a dynamic result type view template and includes it in our
   * bookkeeping.  See UrlbarView.addDynamicViewTemplate().
   *
   * @param {string} name
   *   The view template will be registered for the dynamic result type with
   *   this name.
   * @param {object} viewTemplate
   *   The view template.
   */
  _addDynamicViewTemplate(name, viewTemplate) {
    this._dynamicViewTemplateNames.add(name);
    this._addExtIDToDynamicResultTypeMap(
      experiments_urlbar.extIDsByDynamicViewTemplateName,
      name
    );
    if (viewTemplate.stylesheet) {
      viewTemplate.stylesheet = this.extension.baseURI.resolve(
        viewTemplate.stylesheet
      );
    }
    UrlbarView.addDynamicViewTemplate(name, viewTemplate);
  }

  /**
   * Removes all dynamic result type view templates added by the extension.
   */
  _removeDynamicViewTemplates() {
    for (let name of this._dynamicViewTemplateNames) {
      let allRemoved = this._removeExtIDFromDynamicResultTypeMap(
        experiments_urlbar.extIDsByDynamicViewTemplateName,
        name
      );
      if (allRemoved) {
        UrlbarView.removeDynamicViewTemplate(name);
      }
    }
  }

  /**
   * Adds a dynamic result type name and this extension's ID to a bookkeeping
   * map.
   *
   * @param {Map} map
   *   Either extIDsByDynamicResultTypeName or extIDsByDynamicViewTemplateName.
   * @param {string} dynamicTypeName
   *   The dynamic result type name.
   */
  _addExtIDToDynamicResultTypeMap(map, dynamicTypeName) {
    let extIDs = map.get(dynamicTypeName);
    if (!extIDs) {
      extIDs = new Set();
      map.set(dynamicTypeName, extIDs);
    }
    extIDs.add(this.extension.id);
  }

  /**
   * Removes a dynamic result type name and this extension's ID from a
   * bookkeeping map.
   *
   * @param {Map} map
   *   Either extIDsByDynamicResultTypeName or extIDsByDynamicViewTemplateName.
   * @param {string} dynamicTypeName
   *   The dynamic result type name.
   * @returns {boolean}
   *   True if no other extension IDs are in the map under the same
   *   dynamicTypeName, and false otherwise.
   */
  _removeExtIDFromDynamicResultTypeMap(map, dynamicTypeName) {
    let extIDs = map.get(dynamicTypeName);
    extIDs.delete(this.extension.id);
    if (!extIDs.size) {
      map.delete(dynamicTypeName);
      return true;
    }
    return false;
  }
};
