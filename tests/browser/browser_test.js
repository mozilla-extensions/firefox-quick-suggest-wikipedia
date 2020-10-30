/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

XPCOMUtils.defineLazyModuleGetters(this, {
  ContentTaskUtils: "resource://testing-common/ContentTaskUtils.jsm",
  PlacesTestUtils: "resource://testing-common/PlacesTestUtils.jsm",
  UrlbarPrefs: "resource:///modules/UrlbarPrefs.jsm",
  UrlbarProvidersManager: "resource:///modules/UrlbarProvidersManager.jsm",
  UrlbarTestUtils: "resource://testing-common/UrlbarTestUtils.jsm",
});

// The path of the add-on file relative to `getTestFilePath`.
const ADDON_PATH = "quicksuggest.xpi";
const ABOUT_BLANK = "about:blank";
const URLBAR_PROVIDER_NAME = "ProviderDynamicQuickSuggest";

// Use SIGNEDSTATE_MISSING when testing an unsigned, in-development version of
// the add-on and SIGNEDSTATE_PRIVILEGED when testing the production add-on.
const EXPECTED_ADDON_SIGNED_STATE = AddonManager.SIGNEDSTATE_MISSING;
// const EXPECTED_ADDON_SIGNED_STATE = AddonManager.SIGNEDSTATE_PRIVILEGED;

async function waitForProcessesScalars(
  aProcesses,
  aKeyed,
  aAdditionalCondition = data => true
) {
  await ContentTaskUtils.waitForCondition(() => {
    const scalars = aKeyed
      ? Services.telemetry.getSnapshotForKeyedScalars("main", false)
      : Services.telemetry.getSnapshotForScalars("main", false);
    return (
      aProcesses.every(p => Object.keys(scalars).includes(p)) &&
      aAdditionalCondition(scalars)
    );
  });
}

add_task(async function init() {
  await PlacesUtils.history.clear();
  await PlacesUtils.bookmarks.eraseEverything();

  await initAddonTest(ADDON_PATH, EXPECTED_ADDON_SIGNED_STATE);
});

add_task(async function basic_test() {
  await withAddon(async () => {
    await BrowserTestUtils.withNewTab(ABOUT_BLANK, async () => {
      gURLBar.focus();
      EventUtils.sendString("frab");
      EventUtils.synthesizeKey("KEY_ArrowDown");
      EventUtils.synthesizeKey("KEY_Enter");
      await BrowserTestUtils.browserLoaded(gBrowser.selectedBrowser);
      Assert.ok(
        /q=frabbits/.test(gBrowser.currentURI.spec),
        "Selecting first result visits suggestions URL"
      );
    });
  });
});

add_task(async function test_telemetry_no_impressions() {
  Services.telemetry.clearScalars();
  await withAddon(async () => {
    await BrowserTestUtils.withNewTab(ABOUT_BLANK, async () => {
      gURLBar.focus();
      EventUtils.sendString("frab123");
      await UrlbarTestUtils.promisePopupClose(window, () =>
        window.gURLBar.blur()
      );

      let scalars = TelemetryTestUtils.getProcessScalars("dynamic", true, true);
      Assert.ok(
        !("dynamic" in scalars),
        "Should not have recorded dynamic scalars"
      );
    });
  });
});

add_task(async function test_telemetry_impressions() {
  Services.telemetry.clearScalars();
  await withAddon(async () => {
    await BrowserTestUtils.withNewTab(ABOUT_BLANK, async () => {
      gURLBar.focus();
      EventUtils.sendString("frab");
      EventUtils.synthesizeKey("KEY_ArrowDown");
      EventUtils.synthesizeKey("KEY_Enter");
      await BrowserTestUtils.browserLoaded(gBrowser.selectedBrowser);
      Assert.ok(
        /q=frabbits/.test(gBrowser.currentURI.spec),
        "Selecting first result visits suggestions URL"
      );

      await waitForProcessesScalars(["dynamic"], true, scalars => {
        // Wait for the scalars set in the content process to be available.
        return "browser.search.experiments.impressions" in scalars.dynamic;
      });

      TelemetryTestUtils.assertKeyedScalar(
        TelemetryTestUtils.getProcessScalars("dynamic", true, true),
        "browser.search.experiments.impressions",
        URLBAR_PROVIDER_NAME,
        1
      );
    });
  });
});

add_task(async function test_telemetry_multiple_impressions() {
  Services.telemetry.clearScalars();
  await withAddon(async () => {
    await BrowserTestUtils.withNewTab(ABOUT_BLANK, async () => {
      gURLBar.focus();
      EventUtils.sendString("frab");
      await UrlbarTestUtils.waitForAutocompleteResultAt(window, 1);
      EventUtils.sendString("b");
      EventUtils.synthesizeKey("KEY_ArrowDown");
      EventUtils.synthesizeKey("KEY_Enter");
      await BrowserTestUtils.browserLoaded(gBrowser.selectedBrowser);
      Assert.ok(
        /q=frabbits/.test(gBrowser.currentURI.spec),
        "Selecting first result visits suggestions URL"
      );

      await waitForProcessesScalars(["dynamic"], true, scalars => {
        // Wait for the scalars set in the content process to be available.
        return "browser.search.experiments.impressions" in scalars.dynamic;
      });

      TelemetryTestUtils.assertKeyedScalar(
        TelemetryTestUtils.getProcessScalars("dynamic", true, true),
        "browser.search.experiments.impressions",
        URLBAR_PROVIDER_NAME,
        1
      );
    });
  });
});
