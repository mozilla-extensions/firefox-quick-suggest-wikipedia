# dynamic-weather-result-extension

Watch a [short demo video](https://imgur.com/a/mykAcB6).

## Instructions
1. Clone this repo and install the dependencies.
2. `web-ext build`
3. In Firefox, set the pref `extensions.experiments.enabled` to `true`. Then open about:debugging.
4. Install the .zip file created by `web-ext build` as a temporary add-on.
5. Search for "weather" or "weather in `<LOCATION_NAME>`" in the Urlbar.
