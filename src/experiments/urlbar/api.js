/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global ExtensionAPI, ExtensionCommon */

"use strict";

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  BrowserWindowTracker: "resource:///modules/BrowserWindowTracker.jsm",
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

let { EventManager } = ExtensionCommon;
let queryScorer;
let results = new Map();

this.experiments_urlbar = class extends ExtensionAPI {
  getAPI(context) {

    queryScorer = new QueryScorer();
    for (const block of PT_DATA.cla_blocks) {
      results.set(block.id, block);
      queryScorer.addDocument({
        id: block.id,
        phrases: block.keywords
      })
    }

    return {
      experiments: {
        urlbar: {
          addDynamicResultType: (name, type) => {
            this._addDynamicResultType(name, type);
          },

          scorePhrase: (phrase) => {
            return queryScorer.score(phrase);
          },

          getResult: (id) => {
            return results.get(id);
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

const PT_DATA = {
  "updated_time": "2020-09-28T16:30:00-0400",
  "cla_blocks": [
    {
      "id": 74301,
      "name": "Amazon",
      "keywords": [
        "headphones",
        "headphones amazon"
      ],
      "clas": [
        {
          "click_url": "https://mozilla.ampxdirect.com/amazon?sub1=amazon&sub2=us&sub3=newtab&cu=%URL_ENCODED_LANDING_URL%&ctag=%CTAG%",
          "image_url": "https://images-na.ssl-images-amazon.com/images/I/71o8Q5XJS5L._AC_SL1500_.jpg",
          "impression_url": "https://imp.mt48.net/static?id=7RHzfOIWHG7kJnEYgF3wJFznIFEq7R4dHQlzfC8Z4pDm4ZL%2B7R4dHQ8zx%3DXNHmEuIF%2BkfBIZjF8ZgCxkfZl%2B7nckxYdvIpkZfCla4CqrfpLnHF3m5FwqgCxkfZl%2B7n4NJGeNiFjU5FwqgC8XfQ2Y4BIksGew5FwqgC8y",
          "advertiser_url": "https://www.amazon.com/b/ref=pd_sl_a77559ED8D65AA122020092816?node=12097479011&pf_rd_m=ATVPDKIKX0DER&pf_rd_s=merchandised-search-6&pf_rd_r=QMXWVFK98FWG0B1W126V&pf_rd_t=101&pf_rd_p=7469a3c7-2a80-4619-9b45-5770381edafc&pf_rd_i=172541&tag=admarketus-20",
          "title": "Over-Ear"
        },
        {
          "click_url": "https://mozilla.ampxdirect.com/amazon?sub1=amazon&sub2=us&sub3=newtab&cu=%URL_ENCODED_LANDING_URL%&ctag=%CTAG%",
          "image_url": "https://images-na.ssl-images-amazon.com/images/I/7120GgUKj3L._AC_SL1500_.jpg",
          "impression_url": "https://imp.mt48.net/static?id=7RHzfOIWHG7kJnEYgF3wJFznIFEq7R4dHQlzfC8Z4pDm4ZL%2B7R4dHQ8zx%3DXNHmEuIF%2BkfBIZjF8ZgCxkfZl%2B7nckxYdvIpkZfCla4CqrfpLnHF3m5FwqgCxkfZl%2B7n4NJGeNiFjU5FwqgC8XfQ2Y4BIksGew5FwqgC8y",
          "advertiser_url": "https://www.amazon.com/b/ref=pd_sl_a77559ED8D65AA122020092816?node=12097478011&pf_rd_m=ATVPDKIKX0DER&pf_rd_s=merchandised-search-6&pf_rd_r=QMXWVFK98FWG0B1W126V&pf_rd_t=101&pf_rd_p=7469a3c7-2a80-4619-9b45-5770381edafc&pf_rd_i=172541&tag=admarketus-20",
          "title": "In-Ear"
        },
        {
          "click_url": "https://mozilla.ampxdirect.com/amazon?sub1=amazon&sub2=us&sub3=newtab&cu=%URL_ENCODED_LANDING_URL%&ctag=%CTAG%",
          "image_url": "https://images-na.ssl-images-amazon.com/images/I/71IrHy5bzDL._AC_SL1500_.jpg",
          "impression_url": "https://imp.mt48.net/static?id=7RHzfOIWHG7kJnEYgF3wJFznIFEq7R4dHQlzfC8Z4pDm4ZL%2B7R4dHQ8zx%3DXNHmEuIF%2BkfBIZjF8ZgCxkfZl%2B7nckxYdvIpkZfCla4CqrfpLnHF3m5FwqgCxkfZl%2B7n4NJGeNiFjU5FwqgC8XfQ2Y4BIksGew5FwqgC8y",
          "advertiser_url": "https://www.amazon.com/Sport-Headphones/b/ref=pd_sl_a77559ED8D65AA122020092816?ie=UTF8&node=2266980011&pf_rd_p=28d73b43-f35e-4996-90fe-fb4130c98842&pf_rd_r=ZS07T5H8WSBD8NXJ279X&pf_rd_s=home-audio-subnav-flyout-content-2&pf_rd_t=SubnavFlyout&tag=admarketus-20",
          "title": "Sports & Fitness"
        },
        {
          "click_url": "https://mozilla.ampxdirect.com/amazon?sub1=amazon&sub2=us&sub3=newtab&cu=%URL_ENCODED_LANDING_URL%&ctag=%CTAG%",
          "image_url": "https://images-na.ssl-images-amazon.com/images/I/71WNWRLJCsL._AC_SL1500_.jpg",
          "impression_url": "https://imp.mt48.net/static?id=7RHzfOIWHG7kJnEYgF3wJFznIFEq7R4dHQlzfC8Z4pDm4ZL%2B7R4dHQ8zx%3DXNHmEuIF%2BkfBIZjF8ZgCxkfZl%2B7nckxYdvIpkZfCla4CqrfpLnHF3m5FwqgCxkfZl%2B7n4NJGeNiFjU5FwqgC8XfQ2Y4BIksGew5FwqgC8y",
          "advertiser_url": "https://www.amazon.com/s/ref=pd_sl_a77559ED8D65AA122020092816?rh=i%3Ami%2Cn%3A11974971&ie=UTF8&lo=electronics&bbn=11974971&pf_rd_m=ATVPDKIKX0DER&pf_rd_s=merchandised-search-7&pf_rd_r=W5YR42MZTZ0T33P38C3F&pf_rd_t=101&pf_rd_p=795c4d34-37f2-4974-a83f-e56ccd55a01b&pf_rd_i=172541&tag=admarketus-20",
          "title": "DJ/Professional"
        }
      ]
    },
    {
      "id": 74301,
      "name": "Amazon",
      "keywords": [
        "home decor",
        "home decoration",
        "home decoration ideas",
        "home decor stores"
      ],
      "clas": [
        {
          "click_url": "https://mozilla.ampxdirect.com/amazon?sub1=amazon&sub2=us&sub3=newtab&cu=%URL_ENCODED_LANDING_URL%&ctag=%CTAG%",
          "image_url": "https://images-na.ssl-images-amazon.com/images/I/61qHLSH0TlL._AC_SL1000_.jpg",
          "impression_url": "https://imp.mt48.net/static?id=7RHzfOIWHG7kJnEYgF3wJFznIFEq7R4dHQlzfC8Z4pDm4ZL%2B7R4dHQ8zx%3DXNHmEuIF%2BkfBIZjF8ZgCxkfZl%2B7nckxYdvIpkZfCla4CqrfpLnHF3m5FwqgCxkfZl%2B7n4NJGeNiFjU5FwqgC8XfQ2Y4BIksGew5FwqgC8y",
          "advertiser_url": "https://www.amazon.com/b/ref=pd_sl_a77559ED8D65AA122020092816?node=3736081&pf_rd_m=ATVPDKIKX0DER&pf_rd_s=merchandised-search-4&pf_rd_r=67E90MRSXR28R6FPJ6FJ&pf_rd_t=101&pf_rd_p=f68a7c31-1d5a-479b-9240-984db7c5bc77&pf_rd_i=1063278&tag=admarketus-20",
          "title": "Wall Art"
        },
        {
          "click_url": "https://mozilla.ampxdirect.com/amazon?sub1=amazon&sub2=us&sub3=newtab&cu=%URL_ENCODED_LANDING_URL%&ctag=%CTAG%",
          "image_url": "https://images-na.ssl-images-amazon.com/images/I/81l8GKZROyL._AC_SL1500_.jpg",
          "impression_url": "https://imp.mt48.net/static?id=7RHzfOIWHG7kJnEYgF3wJFznIFEq7R4dHQlzfC8Z4pDm4ZL%2B7R4dHQ8zx%3DXNHmEuIF%2BkfBIZjF8ZgCxkfZl%2B7nckxYdvIpkZfCla4CqrfpLnHF3m5FwqgCxkfZl%2B7n4NJGeNiFjU5FwqgC8XfQ2Y4BIksGew5FwqgC8y",
          "advertiser_url": "https://www.amazon.com/b/ref=pd_sl_a77559ED8D65AA122020092816?node=3736371&pf_rd_m=ATVPDKIKX0DER&pf_rd_s=merchandised-search-4&pf_rd_r=67E90MRSXR28R6FPJ6FJ&pf_rd_t=101&pf_rd_p=f68a7c31-1d5a-479b-9240-984db7c5bc77&pf_rd_i=1063278&tag=admarketus-20",
          "title": "Mirrors"
        },
        {
          "click_url": "https://mozilla.ampxdirect.com/amazon?sub1=amazon&sub2=us&sub3=newtab&cu=%URL_ENCODED_LANDING_URL%&ctag=%CTAG%",
          "image_url": "https://images-na.ssl-images-amazon.com/images/I/710xU17suIL._AC_SL1001_.jpg",
          "impression_url": "https://imp.mt48.net/static?id=7RHzfOIWHG7kJnEYgF3wJFznIFEq7R4dHQlzfC8Z4pDm4ZL%2B7R4dHQ8zx%3DXNHmEuIF%2BkfBIZjF8ZgCxkfZl%2B7nckxYdvIpkZfCla4CqrfpLnHF3m5FwqgCxkfZl%2B7n4NJGeNiFjU5FwqgC8XfQ2Y4BIksGew5FwqgC8y",
          "advertiser_url": "https://www.amazon.com/b/ref=pd_sl_a77559ED8D65AA122020092816?node=1063262&pf_rd_m=ATVPDKIKX0DER&pf_rd_s=merchandised-search-4&pf_rd_r=67E90MRSXR28R6FPJ6FJ&pf_rd_t=101&pf_rd_p=f68a7c31-1d5a-479b-9240-984db7c5bc77&pf_rd_i=1063278&tag=admarketus-20",
          "title": "Decorative Pillows"
        }
      ]
    }
  ]
};
