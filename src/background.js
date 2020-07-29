/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const URLBAR_PROVIDER_NAME = "weather-result";
const DYNAMIC_TYPE_NAME = "dynamicWeather";

// We cache location data for 15 minutes.
let cachedLocation;
let timeLocationCached;

/**
 * If true, use dummy data. Before setting this to false, create
 * src/secret_keys.js and populate it:
 * const DARKSKY_SECRET_KEY = "<Dark Sky API secret key";
 * const BING_SECRET_KEY = "<Bing location services secret key>";
 * */
const TESTING_MODE = true;

// See https://darksky.net/dev/docs#data-point-object for possible values.
const DARKSKY_ICONS = {
  "clear-day": "icons/sun.svg",
  "clear-night": "icons/moon.svg",
  rain: "icons/cloud-rain.svg",
  snow: "icons/cloud-snow.svg",
  sleet: "icons/cloud-snow.svg",
  wind: "icons/wind.svg",
  fog: "icons/cloud.svg",
  cloudy: "icons/cloud.svg",
  "partly-cloudy-day": "icons/cloud.svg",
  "partly-cloudy-night": "icons/cloud.svg",
};

class CachedWeatherResult {
  constructor(data) {
    this._data = data;
    this._timeCached = Date.now();
  }

  get data() {
    return this._data;
  }

  get localityName() {
    if (TESTING_MODE) {
      return "Toronto";
    }
    return this._localityName;
  }

  set localityName(localityName) {
    this._localityName = localityName;
  }

  isExpired() {
    if (TESTING_MODE) {
      return false;
    }

    return Date.now() - this._timeCached > 1000 * 60 * 5;
  }
}

/**
*  Key {string}
*    Location query. e.g., "nyc", "berlin".
*    Empty string for user's current location.
*  Value {CachedWeatherResult}
*/
let cachedWeatherResults = new Map();

// Our provider.
class ProviderDynamicWeatherTest extends UrlbarProvider {
  constructor() {
    super();

    let daysOfWeek = [];
    for (let day = 0; day < 5; day++) {
      daysOfWeek.push({
        name: `day${day}`,
        tag: "div",
        children: [
          {
            name: `dayOfWeek${day}`,
            tag: "span",
          },
          {
            name: `dayIcon${day}`,
            tag: "img",
          },
          {
            name: `dayTemperature${day}`,
            tag: "span",
          },
        ],
      });
    }

    // Register our dynamic result type.
    UrlbarResult.addDynamicResultType(DYNAMIC_TYPE_NAME);
    UrlbarView.addDynamicViewTemplate(DYNAMIC_TYPE_NAME, {
      stylesheet: "data/style.css",
      attributes: {
        role: "group",
      },
      children: [
        {
          name: "info",
          tag: "div",
          children: [
            {
              name: "location",
              tag: "span",
            },
            {
              name: "forecastTime",
              tag: "span",
            },
            {
              name: "currentConditions",
              tag: "span",
            },
            {
              name: "provider",
              tag: "span",
            },
          ],
        },
        {
          name: "current",
          tag: "div",
          children: [
            {
              name: "currentIcon",
              tag: "img",
            },
            {
              name: "currentTemperature",
              tag: "span",
            },
            {
              name: "currentUnits",
              tag: "span",
            },
          ],
        },
        {
          name: "daysContainer",
          tag: "div",
          children: daysOfWeek,
        },
      ]
    });
  }

  get name() {
    return "ProviderDynamicWeatherTest";
  }

  getPriority(queryContext) {
    return 0;
  }

  async isActive(queryContext) {
    // We start caching location and weather data when we are reasonably
    // confident this will be a weather query.
    if (!queryContext.searchString.includes("weat")) {
      return false;
    }

    // TODO: Wait until the user is (probably) done typing before making any API calls.
    let coordinateData;
    let locationQuery = _getLocationString(queryContext.searchString);

    if (locationQuery == "") {
      // We load local weather.
      coordinateData = await getUserCoordinates();
    } else {
      if (locationQuery.length < 3) {
        return false;
      }

      coordinateData = await getCoordinatesFromQuery(locationQuery);
    }

    if (!coordinateData) {
      return false;
    }

    // Two decimal places gives us 1.1km precision: enough to get accurate
    // weather results, but slighly anonymizes the user.
    let latitude = coordinateData.latitude.toFixed(2);
    let longitude = coordinateData.longitude.toFixed(2);

    let data = await getWeatherData(latitude, longitude, locationQuery);

    if (!data) {
      return false;
    }

    if (!data.localityName) {
      data.localityName =
        coordinateData.localityName ||
        (await getLocalityName(latitude, longitude));
    }

    // Now that we've cached our data, we don't actually return the result
    // until the full query is complete.
    if (!queryContext.searchString.includes("weather")) {
      return false;
    }

    return true;
  }

  // Updates the result's view.
  getViewUpdate(result) {
    let viewUpdate = {
      location: {
        textContent: result.payload.locationName,
      },
      forecastTime: {
        textContent: result.payload.forecastTime,
      },
      currentConditions: {
        textContent: result.payload.current.conditions,
      },
      provider: {
        textContent: result.payload.providerName,
      },
      currentIcon: {
        attributes: {
          src: result.payload.current.icon,
        },
      },
      currentTemperature: {
        textContent: result.payload.current.temperature,
      },
      currentUnits: {
        textContent: result.payload.units == "us" ? "°F" : "°C",
      },
    };

    for (let day = 0; day < 5; day++) {
      if (!result.payload.daily[day]) {
        viewUpdate[`day${day}`] = {
          style: {
            display: "none",
          }
        };
        continue;
      }
      viewUpdate[`dayOfWeek${day}`] = {
        textContent: result.payload.daily[day].dayOfWeek,
      };
      viewUpdate[`dayIcon${day}`] = {
        attributes: {
          src: result.payload.daily[day].icon,
        },
      };
      viewUpdate[`dayTemperature${day}`] = {
        textContent:
          result.payload.daily[day].temperatureHigh +
          "° / " +
          result.payload.daily[day].temperatureLow +
          "°",
      };
    }

    return viewUpdate;
  }

  async startQuery(queryContext, addCallback) {
    let locationQuery = _getLocationString(queryContext.searchString);
    let weather = cachedWeatherResults.get(locationQuery);

    if (!weather) {
      return;
    }

    const longDateFormatter = new Intl.DateTimeFormat("default", {
      weekday: "long",
      hour: "numeric",
      minute: "2-digit",
      timeZone: weather.timezone,
    });

    const dayOfWeekFormatter = new Intl.DateTimeFormat("default", {
      weekday: "short",
      timeZone: weather.timezone,
    });

    let dailyForecast = [];
    for (
      let day = 0;
      day < Math.min(5, weather.data.daily.data.length);
      day++
    ) {
      dailyForecast.push({
        dayOfWeek: dayOfWeekFormatter.format(
          weather.data.daily.data[day].time * 1000
        ),
        icon: browser.runtime.getURL(
          DARKSKY_ICONS[weather.data.daily.data[day].icon]
        ),
        temperatureHigh: Math.round(
          weather.data.daily.data[day].temperatureHigh
        ),
        temperatureLow: Math.round(weather.data.daily.data[day].temperatureLow),
      });
    }

    let result = new UrlbarResult(
      UrlbarUtils.RESULT_TYPE.DYNAMIC,
      UrlbarUtils.RESULT_SOURCE.OTHER_NETWORK,
      {
        url: "https://darksky.net/poweredby/",
        providerName: "Powered by Dark Sky",
        locationName: weather.localityName,
        // Convert UNIX time in seconds to milliseconds for the Date() object.
        forecastTime: longDateFormatter.format(
          weather.data.currently.time * 1000
        ),
        units: weather.data.flags.units,
        current: {
          conditions: weather.data.currently.summary,
          icon: browser.runtime.getURL(
            DARKSKY_ICONS[weather.data.currently.icon]
          ),
          temperature: Math.round(weather.data.currently.temperature),
        },
        daily: [dailyForecast, /* Do not highlight payload. */ false],
        dynamicType: DYNAMIC_TYPE_NAME,
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

/**
* @param {Number} latitude
* @param {Number} longitude
* @param {string} locationQuery
*   We first check for recent cached data mapped to the query.
*   If an empty string, we check for local weather data.
* @returns {Promise}
*   Resolves to Dark Sky weather data for the given coordinates.
*/
async function getWeatherData(latitude, longitude, locationQuery) {
  if (TESTING_MODE) {
    let testJson = JSON.parse(
      `{"latitude":43.65,"longitude":-79.39,"timezone":"America/Toronto","currently":{"time":1576097913,"summary":"Mostly Cloudy","icon":"partly-cloudy-day","nearestStormDistance":5,"nearestStormBearing":167,"precipIntensity":0,"precipProbability":0,"temperature":-3.57,"apparentTemperature":-11.88,"dewPoint":-10.1,"humidity":0.61,"pressure":1025.4,"windSpeed":37.17,"windGust":56.69,"windBearing":269,"cloudCover":0.83,"uvIndex":0,"visibility":16.093,"ozone":373.9},"daily":{"summary":"Mixed precipitation on Saturday and Tuesday.","icon":"sleet","data":[{"time":1576040400,"summary":"Partly cloudy throughout the day.","icon":"partly-cloudy-day","sunriseTime":1576068120,"sunsetTime":1576100520,"moonPhase":0.5,"precipIntensity":0.0153,"precipIntensityMax":0.0563,"precipIntensityMaxTime":1576080000,"precipProbability":0.13,"precipType":"snow","precipAccumulation":0.5,"temperatureHigh":-2.41,"temperatureHighTime":1576089900,"temperatureLow":-7.31,"temperatureLowTime":1576147320,"apparentTemperatureHigh":-10.42,"apparentTemperatureHighTime":1576072680,"apparentTemperatureLow":-14.07,"apparentTemperatureLowTime":1576123500,"dewPoint":-10.39,"humidity":0.64,"pressure":1025.5,"windSpeed":25.36,"windGust":57.93,"windGustTime":1576094880,"windBearing":257,"cloudCover":0.39,"uvIndex":1,"uvIndexTime":1576083840,"visibility":16.093,"ozone":363.7,"temperatureMin":-6.92,"temperatureMinTime":1576124220,"temperatureMax":-2.41,"temperatureMaxTime":1576089900,"apparentTemperatureMin":-14.07,"apparentTemperatureMinTime":1576123500,"apparentTemperatureMax":-8.97,"apparentTemperatureMaxTime":1576043460},{"time":1576126800,"summary":"Partly cloudy throughout the day.","icon":"partly-cloudy-day","sunriseTime":1576154580,"sunsetTime":1576186920,"moonPhase":0.53,"precipIntensity":0.0042,"precipIntensityMax":0.0284,"precipIntensityMaxTime":1576144800,"precipProbability":0.08,"precipType":"snow","precipAccumulation":0.1,"temperatureHigh":0.17,"temperatureHighTime":1576195200,"temperatureLow":-0.38,"temperatureLowTime":1576195200,"apparentTemperatureHigh":-5.07,"apparentTemperatureHighTime":1576195200,"apparentTemperatureLow":-5.07,"apparentTemperatureLowTime":1576195200,"dewPoint":-9.58,"humidity":0.63,"pressure":1033,"windSpeed":15.88,"windGust":45.25,"windGustTime":1576209600,"windBearing":211,"cloudCover":0.49,"uvIndex":1,"uvIndexTime":1576170300,"visibility":16.093,"ozone":339.8,"temperatureMin":-7.31,"temperatureMinTime":1576147320,"temperatureMax":1.04,"temperatureMaxTime":1576213200,"apparentTemperatureMin":-13.74,"apparentTemperatureMinTime":1576126800,"apparentTemperatureMax":-4.19,"apparentTemperatureMaxTime":1576213200},{"time":1576213200,"summary":"Overcast throughout the day.","icon":"cloudy","sunriseTime":1576241040,"sunsetTime":1576273320,"moonPhase":0.56,"precipIntensity":0.012,"precipIntensityMax":0.3161,"precipIntensityMaxTime":1576299600,"precipProbability":0.17,"precipType":"rain","temperatureHigh":4.56,"temperatureHighTime":1576260780,"temperatureLow":1.61,"temperatureLowTime":1576291260,"apparentTemperatureHigh":0.89,"apparentTemperatureHighTime":1576261980,"apparentTemperatureLow":-0.98,"apparentTemperatureLowTime":1576324740,"dewPoint":-2.75,"humidity":0.7,"pressure":1020.4,"windSpeed":14.67,"windGust":44.34,"windGustTime":1576213200,"windBearing":186,"cloudCover":0.9,"uvIndex":1,"uvIndexTime":1576256940,"visibility":16.093,"ozone":332.1,"temperatureMin":0.49,"temperatureMinTime":1576213200,"temperatureMax":4.56,"temperatureMaxTime":1576260780,"apparentTemperatureMin":-4.19,"apparentTemperatureMinTime":1576213200,"apparentTemperatureMax":0.89,"apparentTemperatureMaxTime":1576261980},{"time":1576299600,"summary":"Possible light rain until evening.","icon":"rain","sunriseTime":1576327500,"sunsetTime":1576359720,"moonPhase":0.6,"precipIntensity":0.3474,"precipIntensityMax":0.7787,"precipIntensityMaxTime":1576339200,"precipProbability":0.74,"precipType":"rain","temperatureHigh":3.36,"temperatureHighTime":1576351560,"temperatureLow":1.18,"temperatureLowTime":1576389240,"apparentTemperatureHigh":-0.37,"apparentTemperatureHighTime":1576343580,"apparentTemperatureLow":-3.45,"apparentTemperatureLowTime":1576389420,"dewPoint":-0.61,"humidity":0.81,"pressure":1003.7,"windSpeed":13.07,"windGust":41.68,"windGustTime":1576386000,"windBearing":347,"cloudCover":0.99,"uvIndex":1,"uvIndexTime":1576343400,"visibility":11.735,"ozone":344.7,"temperatureMin":1.64,"temperatureMinTime":1576386000,"temperatureMax":3.36,"temperatureMaxTime":1576351560,"apparentTemperatureMin":-2.79,"apparentTemperatureMinTime":1576386000,"apparentTemperatureMax":0.57,"apparentTemperatureMaxTime":1576301820},{"time":1576386000,"summary":"Mostly cloudy throughout the day.","icon":"partly-cloudy-day","sunriseTime":1576413960,"sunsetTime":1576446180,"moonPhase":0.64,"precipIntensity":0.008,"precipIntensityMax":0.0368,"precipIntensityMaxTime":1576411320,"precipProbability":0.2,"precipType":"rain","temperatureHigh":2.55,"temperatureHighTime":1576411200,"temperatureLow":-5.13,"temperatureLowTime":1576496640,"apparentTemperatureHigh":-2.61,"apparentTemperatureHighTime":1576411200,"apparentTemperatureLow":-10.25,"apparentTemperatureLowTime":1576490880,"dewPoint":-7.5,"humidity":0.59,"pressure":1008.9,"windSpeed":25.24,"windGust":46.97,"windGustTime":1576442160,"windBearing":285,"cloudCover":0.71,"uvIndex":1,"uvIndexTime":1576430400,"visibility":16.093,"ozone":361.3,"temperatureMin":-4.07,"temperatureMinTime":1576472400,"temperatureMax":2.85,"temperatureMaxTime":1576394520,"apparentTemperatureMin":-9.7,"apparentTemperatureMinTime":1576455720,"apparentTemperatureMax":-2.33,"apparentTemperatureMaxTime":1576394280},{"time":1576472400,"summary":"Possible light snow overnight.","icon":"fog","sunriseTime":1576500360,"sunsetTime":1576532580,"moonPhase":0.67,"precipIntensity":0.0196,"precipIntensityMax":0.4308,"precipIntensityMaxTime":1576558800,"precipProbability":0.19,"precipType":"snow","precipAccumulation":0.6,"temperatureHigh":-0.4,"temperatureHighTime":1576527240,"temperatureLow":-4.02,"temperatureLowTime":1576587600,"apparentTemperatureHigh":-5.47,"apparentTemperatureHighTime":1576526640,"apparentTemperatureLow":-9.93,"apparentTemperatureLowTime":1576557300,"dewPoint":-10.69,"humidity":0.55,"pressure":1022.5,"windSpeed":17.1,"windGust":53.42,"windGustTime":1576558800,"windBearing":218,"cloudCover":0.8,"uvIndex":1,"uvIndexTime":1576516200,"visibility":14.078,"ozone":330.3,"temperatureMin":-5.13,"temperatureMinTime":1576496640,"temperatureMax":-0.4,"temperatureMaxTime":1576527240,"apparentTemperatureMin":-10.25,"apparentTemperatureMinTime":1576490880,"apparentTemperatureMax":-5.47,"apparentTemperatureMaxTime":1576526640},{"time":1576558800,"summary":"Possible light snow in the morning.","icon":"snow","sunriseTime":1576586820,"sunsetTime":1576618980,"moonPhase":0.71,"precipIntensity":0.3693,"precipIntensityMax":1.053,"precipIntensityMaxTime":1576574520,"precipProbability":0.52,"precipType":"snow","precipAccumulation":9.9,"temperatureHigh":0.57,"temperatureHighTime":1576609620,"temperatureLow":-8.81,"temperatureLowTime":1576672680,"apparentTemperatureHigh":-4.9,"apparentTemperatureHighTime":1576610280,"apparentTemperatureLow":-16.49,"apparentTemperatureLowTime":1576671780,"dewPoint":-7.86,"humidity":0.66,"pressure":1012.7,"windSpeed":20.64,"windGust":56.52,"windGustTime":1576645200,"windBearing":0,"cloudCover":0.81,"uvIndex":1,"uvIndexTime":1576602720,"visibility":10.162,"ozone":353.3,"temperatureMin":-5.15,"temperatureMinTime":1576593120,"temperatureMax":0.57,"temperatureMaxTime":1576609620,"apparentTemperatureMin":-11.28,"apparentTemperatureMinTime":1576593960,"apparentTemperatureMax":-4.9,"apparentTemperatureMaxTime":1576610280},{"time":1576645200,"summary":"Overcast throughout the day.","icon":"cloudy","sunriseTime":1576673280,"sunsetTime":1576705440,"moonPhase":0.75,"precipIntensity":0.0122,"precipIntensityMax":0.0287,"precipIntensityMaxTime":1576671900,"precipProbability":0.13,"precipType":"snow","precipAccumulation":0.5,"temperatureHigh":-4.54,"temperatureHighTime":1576695780,"temperatureLow":-11.06,"temperatureLowTime":1576757580,"apparentTemperatureHigh":-11.22,"apparentTemperatureHighTime":1576696200,"apparentTemperatureLow":-19.62,"apparentTemperatureLowTime":1576757400,"dewPoint":-13.76,"humidity":0.57,"pressure":1017.3,"windSpeed":22.05,"windGust":60.57,"windGustTime":1576653540,"windBearing":294,"cloudCover":0.79,"uvIndex":1,"uvIndexTime":1576689420,"visibility":13.388,"ozone":381.2,"temperatureMin":-8.81,"temperatureMinTime":1576672680,"temperatureMax":-3.71,"temperatureMaxTime":1576645200,"apparentTemperatureMin":-16.49,"apparentTemperatureMinTime":1576671780,"apparentTemperatureMax":-11.2,"apparentTemperatureMaxTime":1576645200}]},"flags":{"sources":["cmc","gfs","hrrr","icon","isd","madis","nam","sref","darksky","nearest-precip"],"nearest-station":2.023,"units":"ca"},"offset":-5}`
    );
    let result = new CachedWeatherResult(testJson);
    cachedWeatherResults.set(locationQuery, result);
    return result;
  }

  let cachedResult = cachedWeatherResults.get(locationQuery);
  if (cachedResult) {
    if (cachedResult.isExpired()) {
      cachedWeatherResults.delete(locationQuery);
    } else {
      return cachedResult;
    }
  }

  const urlObj = new URL("https://api.darksky.net");
  // eslint-disable-next-line no-undef
  urlObj.pathname = `forecast/${DARKSKY_SECRET_KEY}/${latitude},${longitude}`;
  const params = new URLSearchParams([
    ["exclude", "minutely,hourly,alerts"],
    // TODO: Consider making units a user preference. This "auto" setting sets
    // units based on the user's location.
    ["units", "auto"],
  ]);
  const url = urlObj.toString() + "?" + params.toString();

  const response = await fetch(url);
  if (!response || !response.ok) {
    return null;
  }
  const json = await response.json();
  let result = new CachedWeatherResult(json);
  cachedWeatherResults.set(locationQuery, result);
  return result;
}

/**
* Returns a pair of coordinates representing the user's location.
* A cached location is returned up to 15 minutes after the last polling.
* @returns {Promise}
*   Resolves to an Object: {latitude, longitude}
*/
async function getUserCoordinates() {
  if (TESTING_MODE) {
    return {
      latitude: 43.64,
      longitude: -79.39,
    };
  }
  if (
    cachedLocation &&
    timeLocationCached &&
    Date.now() - timeLocationCached < 1000 * 60 * 15
  ) {
    return {
      latitude: cachedLocation.latitude,
      longitude: cachedLocation.longitude,
    };
  } else if ("geolocation" in navigator) {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        position => {
          cachedLocation = position.coords;
          timeLocationCached = Date.now();
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        error => reject(error)
      );
    });
  }
  return new Promise();
}

/**
* @param {string} query
*   A string that queries for a location. e.g. "Toronto"; "366 Adelaide St W".
* @returns {Promise}
*   Resolves to an Object: {latitude, longitude, locality}
*/
async function getCoordinatesFromQuery(query) {
  if (TESTING_MODE) {
    return {
      latitude: 43.64,
      longitude: -79.39,
      localityName: "Toronto",
    };
  }
  const urlObj = new URL("https://dev.virtualearth.net");
  urlObj.pathname = `REST/v1/Locations/`;
  const params = new URLSearchParams([
    ["q", query],
    ["maxRes", 1],
    // eslint-disable-next-line no-undef
    ["key", BING_SECRET_KEY],
  ]);
  const url = urlObj.toString() + "?" + params.toString();

  const response = await fetch(url);
  const json = await response.json();
  if (
    json.resourceSets.length < 1 ||
    json.resourceSets[0].resources.length < 1
  ) {
    // No relevant results.
    return {};
  }
  return {
    latitude: json.resourceSets[0].resources[0].point.coordinates[0],
    longitude: json.resourceSets[0].resources[0].point.coordinates[1],
    localityName: json.resourceSets[0].resources[0].address.locality,
  };
}

/**
* @param {Number} latitude
* @param {Number} longitude
* @returns {Promise}
*   Resolves to the of the city, town, or other locality corresponding
*   to the given coordinates.
*/
async function getLocalityName(latitude, longitude) {
  const urlObj = new URL("https://dev.virtualearth.net");
  urlObj.pathname = `REST/v1/Locations/${latitude},${longitude}`;
  const params = new URLSearchParams([
    ["includeEntityTypes", "Address"],
    // eslint-disable-next-line no-undef
    ["key", BING_SECRET_KEY],
  ]);
  const url = urlObj.toString() + "?" + params.toString();

  const response = await fetch(url);
  const json = await response.json();
  if (
    json.resourceSets.length < 1 ||
    json.resourceSets[0].resources.length < 1
  ) {
    // No relevant results.
    return null;
  }
  return json.resourceSets[0].resources[0].address.locality;
}

/**
* Returns a location that the user is searching for. The return value is used
* to get and set values in the cache.
* @param {string} searchString
*   The query typed by the user.
* @returns {string}
*   The location the user is searching for. For example, "weather in berlin"
*   returns "berlin". If no location is detected, the empty string is returned.
*/
function _getLocationString(searchString) {
  if (
    searchString.includes("weather in") ||
    searchString.includes("weather at")
  ) {
    // TODO: Make this less brittle and more flexible. e.g. "berlin weather"
    return searchString
      .slice(
        // 7: "weather".length
        // 3: " at"/" in".length
        searchString.indexOf("weather") + 7 + 3
      )
      .trim();
  }

  return "";
}

// main
let testProvider;
(async function main() {
  testProvider = new ProviderDynamicWeatherTest();
  addProvider(testProvider);
})();
