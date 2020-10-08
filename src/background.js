/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from shim.js */

const URLBAR_PROVIDER_NAME = "pt-result";
const DYNAMIC_TYPE_NAME = "dynamicPtResult";

let api = browser.experiments.urlbar;
let matchedResult = null;

// Our provider.
class ProviderDynamicPalmTree extends UrlbarProvider {
  constructor() {
    super();
  }

  get name() {
    return "ProviderDynamicPalmTree";
  }

  getPriority(queryContext) {
    return 0;
  }

  async isActive(queryContext) {
    matchedResult = await api.matchSearchTerm(queryContext.searchString);
    return !!matchedResult;
  }

  async startQuery(queryContext, addCallback) {
    let result = new UrlbarResult(
      UrlbarUtils.RESULT_TYPE.URL,
      UrlbarUtils.RESULT_SOURCE.OTHER_NETWORK,
      {
        title: `TripAdvisor - view all "${queryContext.searchString}"`,
        url: matchedResult.url,
        icon: browser.runtime.getURL("icons/favicon.ico"),
      }
    );
    result.suggestedIndex = 1;
    addCallback(this, result);
  }

  cancelQuery(queryContext) {}

  pickResult(result) {
    console.log("Result picked!", result);
  }
}

(async function main() {
  let testProvider = new ProviderDynamicPalmTree();
  addProvider(testProvider);
})();
