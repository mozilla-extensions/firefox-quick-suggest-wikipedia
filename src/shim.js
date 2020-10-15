/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const providerEvents = [
  "onBehaviorRequested",
  "onResultsRequested",
  "onViewUpdateRequested",
  "onResultPicked",
  "onQueryCanceled",
  "onEngagement",
];

// eslint-disable-next-line no-unused-vars
class UrlbarProvider {
  constructor(name) {
    for (let event of providerEvents) {
      this[event] = this[event].bind(this);
      (browser.urlbar[event] || browser.experiments.urlbar[event]).addListener(
        this[event],
        this.name
      );
    }
  }

  removeListeners() {
    for (let event of providerEvents) {
      (
        browser.urlbar[event] || browser.experiments.urlbar[event]
      ).removeListener(this[event], this.name);
    }
  }

  async onBehaviorRequested(query) {
    if (!(await this.isActive(query))) {
      return "inactive";
    }
    if ((await this.getPriority(query)) > 0) {
      return "restricting";
    }
    return "active";
  }

  async onResultsRequested(query) {
    let results = [];
    await this.startQuery(query, (p, result) => results.push(result));
    return results;
  }

  async onViewUpdateRequested(payload) {
    return this.getViewUpdate({ payload });
  }

  async onResultPicked(payload) {
    await this.pickResult({ payload });
  }

  async onQueryCanceled(query) {
    await this.cancelQuery(query);
  }

  async onEngagement(state) {
    await this.handleEngagement(state);
  }
}

// eslint-disable-next-line no-unused-vars
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

// eslint-disable-next-line no-unused-vars
class UrlbarView {
  static addDynamicViewTemplate(name, viewTemplate) {
    browser.experiments.urlbar.addDynamicViewTemplate(name, viewTemplate);
  }
}

// eslint-disable-next-line no-unused-vars
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
