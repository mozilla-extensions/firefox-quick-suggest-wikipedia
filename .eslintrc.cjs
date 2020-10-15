/* eslint-disable */

"use strict";

const browserTestConfig = require("eslint-plugin-mozilla/lib/configs/browser-test.js");

module.exports = {
  extends: [
    "eslint:recommended",
    "plugin:prettier/recommended",
    "plugin:mozilla/recommended",
  ],
  parserOptions: {
    sourceType: "module",
    ecmaVersion: 12,
  },
  plugins: ["mozilla"],
  overrides: [
    {
      files: ["src/*.js"],
      env: {
        browser: false,
        webextensions: true,
      },
    },
    // Copied and modified from mozilla-central/.eslintrc.js
    {
      files: ["tests/**/browser/**"],
      ...browserTestConfig,
    },
  ],
};
