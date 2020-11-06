// @flow
const {
  validRange,
  intersects,
  satisfies,
  minVersion,
  compare,
  gt,
  coerce,
} = require('../vendor/semver/index.js');
const {cachedArity1, cachedArity2} = require('./cached');

module.exports = {
  coerce: cachedArity1(coerce),
  satisfies: cachedArity2(satisfies),
  minVersion: cachedArity1(minVersion),
  compare: cachedArity2(compare),
  gt: cachedArity2(gt),
  validRange: cachedArity1(validRange),
  intersects: cachedArity2(intersects),
};
