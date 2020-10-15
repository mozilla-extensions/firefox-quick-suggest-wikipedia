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
const ADDON_PATH = "example_addon_experiment-1.0.0.zip";

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

add_task(async function treatment() {
  await withStudy({ branch: TREATMENT_BRANCH }, async () => {
    await withAddon(async () => {
      await assertEnrolled(true);
    });
  });
});

add_task(async function control() {
  await withStudy({ branch: CONTROL_BRANCH }, async () => {
    await withAddon(async () => {
      await assertEnrolled(false);
    });
  });
});

add_task(async function unenrollAfterInstall() {
  await withStudy({ branch: TREATMENT_BRANCH }, async (study) => {
    await withAddon(async () => {
      await assertEnrolled(true);
      await Promise.all([
        awaitAddonMessage("unenrolled"),
        AddonStudies.markAsEnded(study),
      ]);
      await assertNotEnrolled();
    });
  });
});

add_task(async function unenrollBeforeInstall() {
  await withStudy({ branch: TREATMENT_BRANCH }, async (study) => {
    await AddonStudies.markAsEnded(study);
    await withAddon(async () => {
      await assertNotEnrolled();
    });
  });
});

add_task(async function noBranch() {
  await withStudy({}, async () => {
    await withAddon(async () => {
      await assertNotEnrolled();
    });
  });
});

add_task(async function unrecognizedBranch() {
  await withStudy({ branch: "bogus" }, async () => {
    await withAddon(async () => {
      await assertNotEnrolled();
    });
  });
});

add_task(async function noStudy() {
  if (EXPECTED_ADDON_SIGNED_STATE == AddonManager.SIGNEDSTATE_MISSING) {
    info("This test doesn't apply to an unsigned add-on, skipping.");
    return;
  }
  await withAddon(async (addon) => {
    await assertNotEnrolled();
  });
});

add_task(async function unrelatedStudy() {
  if (EXPECTED_ADDON_SIGNED_STATE == AddonManager.SIGNEDSTATE_MISSING) {
    info("This test doesn't apply to an unsigned add-on, skipping.");
    return;
  }
  await withStudy(
    {
      addonId: "someOtherAddon@mozilla.org",
      branch: TREATMENT_BRANCH,
    },
    async () => {
      await withAddon(async () => {
        await assertNotEnrolled();
      });
    }
  );
});

// Checks engagement event telemetry while enrolled in the study on the
// treatment branch.  We have a separate comprehensive test in the tree for this
// telemetry, so we don't test everything here.  We only make sure that the
// telemetry is indeed recorded.
add_task(async function telemetryTreatment() {
  Services.telemetry.clearEvents();
  await withStudy({ branch: TREATMENT_BRANCH }, async () => {
    await withAddon(async () => {
      //XXX Do whatever triggers the telemetry in your case.  Then for example:
      /*
      TelemetryTestUtils.assertEvents([
        {
          category: "urlbar",
          method: "engagement",
          object: "click",
          value: "topsites",
          extra: {
            elapsed: val => parseInt(val) > 0,
            numChars: "0",
            selIndex: "1",
            selType: "history",
          },
        },
      ]);
*/
    });
  });
});

// Checks engagement event telemetry while enrolled in the study on the control
// branch.
add_task(async function telemetryControl() {
  Services.telemetry.clearEvents();
  await withStudy({ branch: CONTROL_BRANCH }, async () => {
    await withAddon(async () => {
      //XXX Do whatever triggers the telemetry in your case.  Then for example:
      /*
      // This is actually the same telemetry that should have been recorded on
      // the treatment branch.  (See the treatment-branch test above.)  We will
      // be able to distinguish between treatment and control telemetry in the
      // telemetry pings.
      TelemetryTestUtils.assertEvents([
        {
          category: "urlbar",
          method: "engagement",
          object: "click",
          value: "topsites",
          extra: {
            elapsed: val => parseInt(val) > 0,
            numChars: "0",
            selIndex: "1",
            selType: "history",
          },
        },
      ]);
*/
    });
  });
});
