/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

class UrlbarProvider {}

class UrlbarResult {
  constructor(resultType, resultSource, payload) {
    this.type = resultType;
    this.source = resultSource;
    this.payload = payload;
  }

  static addDynamicResultType(name, type = {}) {
    browser.experiments.urlbar.addDynamicResultType(name, type);
  }
}

class UrlbarView {
  static addDynamicViewTemplate(name, viewTemplate) {
    browser.experiments.urlbar.addDynamicViewTemplate(name, viewTemplate);
  }
}

let UrlbarUtils = {
  RESULT_TYPE: {
    TAB_SWITCH: "tab",
    SEARCH: "search",
    URL: "url",
    REMOTE_TAB: "tab",
    TIP: "tip",
    DYNAMIC: "dynamic",
  },
  RESULT_SOURCE: {
    BOOKMARKS: "bookmarks",
    HISTORY: "history",
    SEARCH: "search",
    TABS: "tabs",
    OTHER_LOCAL: "local",
    OTHER_NETWORK: "network",
  },
};

async function addProvider(provider) {
  let listeners = {
    async onBehaviorRequested(query) {
      if (!(await this.isActive(query))) {
        return "inactive";
      }
      if ((await this.getPriority(query)) > 0) {
        return "restricting";
      }
      return "active";
    },
    async onResultsRequested(query) {
      let results = [];
      await this.startQuery(query, (p, result) => results.push(result));
      return results;
    },
    async onViewUpdateRequested(payload) {
      return this.getViewUpdate({ payload });
    },
    async onResultPicked(payload) {
      await this.pickResult({ payload });
    },
    //     async onEngagement(state) {
    //       let isPrivate = false; //XXXadw
    //       await this.onEngagement(isPrivate, state);
    //     },
    async onQueryCanceled(query) {
      await this.cancelQuery(query);
    },
  };

  provider = Object.assign(provider, listeners);

  for (let listenerName in listeners) {
    let listenerObj =
      browser.urlbar[listenerName] || browser.experiments.urlbar[listenerName];
    await listenerObj.addListener(
      provider[listenerName].bind(provider),
      provider.name
    );
  }
}
