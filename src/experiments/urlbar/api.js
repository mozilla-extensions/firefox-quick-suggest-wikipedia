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
  UrlbarResult: "resource:///modules/UrlbarResult.jsm",
  UrlbarView: "resource:///modules/UrlbarView.jsm",
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
          addDynamicResultType: (name, type) => {
            this._addDynamicResultType(name, type);
          },

          addDynamicViewTemplate: (name, viewTemplate) => {
            this._addDynamicViewTemplate(name, viewTemplate);
          },
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
