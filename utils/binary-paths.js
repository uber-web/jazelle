// @flow
const path = require('path');
const fs = require('fs');
const {getRootDir} = require('../utils/get-root-dir');

const paths = {
  bazel:
    String(process.env.BAZELISK_PATH) ||
    String(process.env.BAZEL) ||
    `${__dirname}/../bin/bazelisk`,
  node: String(process.argv[0]),
  // TODO: Fix this now with yarn v2
  yarn: String(process.env.YARN) || `${__dirname}/../bin/yarn.js`, // this env var is created by rules/jazelle.bzl, the yarn binary is put there by preinstall hook
};

try {
  const rootDir = getRootDir({dir: process.cwd()});
  const yarnrcPath = path.join(rootDir, '.yarnrc.yml');
  if (fs.existsSync(yarnrcPath)) {
    const yarnrcContents = fs.readFileSync(yarnrcPath, 'utf8');
    const yarnPathMatch = yarnrcContents.match(/^yarnPath:(.*)/m);
    if (yarnPathMatch && yarnPathMatch[1]) {
      const yarnPath = path.resolve(rootDir, yarnPathMatch[1].trim());
      if (fs.existsSync(yarnPath)) {
        paths.yarn = yarnPath;
      }
    }
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
