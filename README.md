# dynamic-weather-result-extension

Watch a [short demo video](https://imgur.com/a/T81yjxJ).

## Instructions
1. In a custom build of Firefox, apply [this patch](https://phabricator.services.mozilla.com/D71921) which will enable dynamic results.
2. Clone this repo and install the dependencies.
3. `web-ext build`
4. In your local build of Firefox, open about:debugging.
5. Install the .zip file created by `web-ext build` as a temporary add-on.
6. Search for "weather" or "weather in `<LOCATION_NAME>`" in the Urlbar.