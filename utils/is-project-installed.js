// @flow
const {exists} = require('./node-helpers.js');

/*::
type IsProjectInstalledArgs = {
  root: string,
  cwd: string,
};
type IsProjectInstalled = (IsProjectInstalledArgs) => Promise<boolean>;
type Source = {|
  dir: string,
  hash: string,
  upstreams: Array<string>,
|};
*/
const isProjectInstalled /*: IsProjectInstalled */ = async ({root, cwd}) => {
  const hasBuildFile = await exists(`${cwd}/BUILD.bazel`);
  const hasYarnBuildState = await exists(`${root}/.yarn/build-state.yml`);
  return hasBuildFile && hasYarnBuildState;
};

module.exports = {isProjectInstalled};
