"use strict";

const validator = require("./aircraft_validator");

function makeAction(type, payload = {}) {
  return { type, ...payload };
}

module.exports = {
  ...validator,
  makeAction,
};
