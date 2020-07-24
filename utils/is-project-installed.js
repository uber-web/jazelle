// @flow
const {read, exists} = require('./node-helpers.js');

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
  return exists(`${cwd}/BUILD.bazel`);
};

module.exports = {isProjectInstalled};
