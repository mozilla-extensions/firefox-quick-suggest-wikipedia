/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/* eslint-disable */

"use strict";

XPCOMUtils.defineLazyModuleGetters(this, {
  PlacesTestUtils: "resource://testing-common/PlacesTestUtils.jsm",
  UrlbarPrefs: "resource:///modules/UrlbarPrefs.jsm",
  UrlbarProvidersManager: "resource:///modules/UrlbarProvidersManager.jsm",
  UrlbarTestUtils: "resource://testing-common/UrlbarTestUtils.jsm",
});

// The path of the add-on file relative to `getTestFilePath`.
const ADDON_PATH = "quicksuggest.xpi";

// Use SIGNEDSTATE_MISSING when testing an unsigned, in-development version of
// the add-on and SIGNEDSTATE_PRIVILEGED when testing the production add-on.
const EXPECTED_ADDON_SIGNED_STATE = AddonManager.SIGNEDSTATE_MISSING;
// const EXPECTED_ADDON_SIGNED_STATE = AddonManager.SIGNEDSTATE_PRIVILEGED;

const CONTROL_BRANCH = "control";
const TREATMENT_BRANCH = "treatment";

const EVENT_TELEMETRY_PREF = "eventTelemetry.enabled";

/**
 * Asserts that the browser UI has the treatment properly applied.
 *
 * @param {window} win
 *   The browser window to test.
 */
async function assertAppliedTreatmentToUI(win = window) {
  //XXX assertions here
}

/**
 * Asserts that the browser UI does not have the treatment applied.
 *
 * @param {window} win
 *   The browser window to test.
 */
async function assertNotAppliedTreatmentToUI(win = window) {
  //XXX assertions here
}

/**
 * Asserts that everything is set up properly to reflect enrollment in the
 * study.
 *
 * @param {bool} isTreatmentBranch
 *   True if the enrolled branch is treatment and false if control.
 */
async function assertEnrolled(isTreatmentBranch) {
  Assert.equal(UrlbarPrefs.get(EVENT_TELEMETRY_PREF), true);
  if (isTreatmentBranch) {
    await assertAppliedTreatmentToUI();
  } else {
    await assertNotAppliedTreatmentToUI();
  }
}

/**
 * Asserts that everything is set up properly to reflect no enrollment in the
 * study.
 */
async function assertNotEnrolled() {
  Assert.equal(UrlbarPrefs.get(EVENT_TELEMETRY_PREF), false);
  await assertNotAppliedTreatmentToUI();
}

add_task(async function init() {
  await PlacesUtils.history.clear();
  await PlacesUtils.bookmarks.eraseEverything();

  await initAddonTest(ADDON_PATH, EXPECTED_ADDON_SIGNED_STATE);
});

add_task(async function basic_test() {
  Assert.ok(true, "Basic test")
});
