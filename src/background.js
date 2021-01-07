/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from shim.js */

const BRANCHES = {
  CONTROL: "control",
  TREATMENT: "treatment",
};

const URLBAR_PROVIDER_NAME = "ProviderDynamicQuickSuggestWiki";

const VIEW_TEMPLATE = {
  stylesheet: "data/style.css",
  attributes: {
    role: "group",
    selectable: true,
  },
  children: [
    {
      name: "noWrap",
      tag: "span",
      classList: ["urlbarView-no-wrap"],
      children: [
        {
          name: "icon",
          tag: "img",
          classList: ["urlbarView-favicon"],
        },
        {
          name: "textContent",
          tag: "div",
          children: [
            {
              name: "title",
              tag: "strong",
              classList: ["urlbarView-title"],
            },
            {
              name: "description",
              tag: "div",
              classList: ["urlbarView-description"],
            },
          ],
        },
      ],
    },
  ],
};

let api = browser.experiments.urlbar;
let testProvider = null;

// Our provider.
class ProviderDynamicQuickSuggest extends UrlbarProvider {
  constructor() {
    super();
    UrlbarResult.addDynamicResultType(URLBAR_PROVIDER_NAME);
    UrlbarView.addDynamicViewTemplate(URLBAR_PROVIDER_NAME, VIEW_TEMPLATE);
    this._resultReturned = false;
    this._displayingResult = false;
    // Store the result from the urlbar provider so we can
    // share between isActive and startQuery.
    this.matchedResult = null;
  }

  get name() {
    return URLBAR_PROVIDER_NAME;
  }

  getPriority(queryContext) {
    return 0;
  }

  async isActive(queryContext) {
    this.matchedResult = await api.matchSearchTerm(
      queryContext.searchString.toLowerCase()
    );
    if (!this.matchedResult) {
      this._displayingResult = false;
    }
    return !!this.matchedResult;
  }

  async startQuery(queryContext, addCallback) {
    if (!this.matchedResult) {
      this._displayingResult = false;
      return;
    }
    this._displayingResult = true;
    let result = new UrlbarResult(
      UrlbarUtils.RESULT_TYPE.DYNAMIC,
      UrlbarUtils.RESULT_SOURCE.OTHER_NETWORK,
      {
        title: this.matchedResult.title,
        description: this.matchedResult.description,
        url: this.matchedResult.url,
        icon: this.matchedResult.icon,
        dynamicType: URLBAR_PROVIDER_NAME,
      }
    );
    result.suggestedIndex = this.matchedResult.suggestedIndex ?? 1;
    addCallback(this, result);
    this._resultReturned = true;
  }

  getViewUpdate(result) {
    let viewUpdate = {
      title: {
        textContent: result.payload.title,
      },
      description: {
        textContent: result.payload.description,
      },
      icon: {
        attributes: {
          src: result.payload.icon,
        },
      },
    };

    return viewUpdate;
  }

  cancelQuery(queryContext) {}

  pickResult(result) {
    // TODO: Fix that this leaves the focus in the omnibar.
    browser.tabs.update({ url: this.matchedResult.url });
  }

  handleEngagement(state) {
    if (state == "start") {
      this._resultReturned = false;
      this._displayingResult = false;
      return;
    }

    if (["engagement", "abandonment"].includes(state)) {
      if (this._resultReturned) {
        browser.telemetry.keyedScalarAdd(
          "browser.search.experiments.impressions",
          URLBAR_PROVIDER_NAME,
          1
        );
      }
      if (this._displayingResult) {
        browser.telemetry.keyedScalarAdd(
          "browser.search.experiments.impressions_at_end",
          URLBAR_PROVIDER_NAME,
          1
        );
      }
    }
  }
}

/**
 * Logs a debug message, which the test harness interprets as a message the
 * add-on is sending to the test.  See head.js for info.
 *
 * @param {string} msg
 *   The message.
 */
function sendTestMessage(msg) {
  console.debug(browser.runtime.id, msg);
}

/**
 * Resets all the state we set on enrollment in the study.
 *
 * @param {bool} isTreatmentBranch
 *   True if we were enrolled on the treatment branch, false if control.
 */
async function unenroll(isTreatmentBranch) {
  await browser.urlbar.engagementTelemetry.clear({});
  if (isTreatmentBranch) {
    testProvider.removeListeners();
  }
  sendTestMessage("unenrolled");
}

/**
 * Sets up all appropriate state for enrollment in the study.
 *
 * @param {bool} isTreatmentBranch
 *   True if we are enrolling on the treatment branch, false if control.
 */
async function enroll(isTreatmentBranch) {
  await browser.normandyAddonStudy.onUnenroll.addListener(async () => {
    await unenroll(isTreatmentBranch);
  });

  // Enable urlbar engagement event telemetry.  See bugs 1559136 and 1570683.
  await browser.urlbar.engagementTelemetry.set({ value: true });

  if (isTreatmentBranch) {
    // Add our specific scalars.
    await browser.telemetry.registerScalars("browser.search.experiments", {
      impressions: {
        keyed: true,
        kind: browser.telemetry.ScalarType.COUNT,
        record_on_release: true,
      },
      impressions_at_end: {
        keyed: true,
        kind: browser.telemetry.ScalarType.COUNT,
        record_on_release: true,
      },
    });

    // Enable our provider.
    testProvider = new ProviderDynamicQuickSuggest();
  }

  sendTestMessage("enrolled");
}

(async function main() {
  // As a development convenience, act like we're enrolled in the treatment
  // branch if we're a temporary add-on.  onInstalled with details.temporary =
  // true will be fired in that case.  Add the listener now before awaiting the
  // study below to make sure we don't miss the event.
  let installPromise = new Promise(resolve => {
    browser.runtime.onInstalled.addListener(details => {
      resolve(details.temporary);
    });
  });

  // If we're enrolled in the study, set everything up, and then we're done.
  let study = await browser.normandyAddonStudy.getStudy();
  if (study) {
    // Sanity check the study.  This conditional should always be true.
    if (study.active && Object.values(BRANCHES).includes(study.branch)) {
      await enroll(study.branch == BRANCHES.TREATMENT);
    }
    sendTestMessage("ready");
    return;
  }

  // There's no study.  If installation happens, then continue with the
  // development convenience described above.
  installPromise.then(async isTemporaryInstall => {
    if (isTemporaryInstall) {
      console.debug("isTemporaryInstall");
      await enroll(true);
    }
    sendTestMessage("ready");
  });
})();
