// @flow
const path = require('path');
const fs = require('fs');
const {getRootDir} = require('../utils/get-root-dir');

const paths = {
  bazel: `${__dirname}/../bin/bazelisk`,
  node: String(process.argv[0]),
  // TODO: Fix this now with yarn v2
  yarn: String(
    process.env.YARN || `${__dirname}/../bin/yarn.js` // this env var is created by rules/jazelle.bzl, the yarn binary is put there by preinstall hook
  ),
};

try {
  const berryPath = path.join(
    getRootDir({dir: process.cwd()}),
    '.yarn/releases/yarn-sources.cjs'
  );
  if (fs.existsSync(berryPath)) {
    paths.yarn = berryPath;
  }
  /* eslint-disable-next-line no-empty */
} catch (e) {}

/*::
export type BinName = string
export type BinPath = (name: BinName) => string
*/
const getBinaryPath /*: BinPath */ = name => {
  return path.resolve(paths[name]);
};

module.exports = {
  ...paths,
  getBinaryPath,
};
