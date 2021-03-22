// @flow
const {getManifest} = require('../utils/get-manifest.js');
const {getAllDependencies} = require('../utils/get-all-dependencies.js');
const {sortPackageJson} = require('../utils/sort-package-json.js');
const {write} = require('../utils/node-helpers.js');

/*::
type SortArgs = {
  root: string,
}
type Sort = (SortArgs) => Promise<void>
*/

const sort /*: Sort */ = async ({root}) => {
  const {projects} = await getManifest({root});
  const deps = await getAllDependencies({root, projects});

  for (const dep of deps) {
    await write(`${dep.dir}/package.json`, sortPackageJson(dep.meta), 'utf8');
  }
};

module.exports = {sort};
