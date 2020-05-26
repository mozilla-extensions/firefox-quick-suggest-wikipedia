# dynamic-weather-result-extension

Watch a [short demo video](https://imgur.com/a/T81yjxJ).

## Instructions
1. In a custom build of Firefox, apply [this patch](https://phabricator.services.mozilla.com/D71921) which will enable dynamic results.
2. In about:config, set the pref `extensions.experiments.enabled` to `true`.
3. Clone this repo and install the dependencies.
4. `web-ext build`
5. In your local build of Firefox, open about:debugging.
6. Install the .zip file created by `web-ext build` as a temporary add-on.
7. Search for "weather" or "weather in `<LOCATION_NAME>`" in the Urlbar.
