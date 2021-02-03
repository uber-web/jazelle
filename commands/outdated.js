// @flow
const {getManifest} = require('../utils/get-manifest.js');
const {getAllDependencies} = require('../utils/get-all-dependencies.js');
const {exec} = require('../utils/node-helpers.js');
const {node, yarn} = require('../utils/binary-paths.js');
const {minVersion, gt, validRange} = require('../utils/cached-semver');

/*::
type OutdatedArgs = {
  root: string,
  logger?: (...data: Array<mixed>) => void | mixed
};
type Outdated = (OutdatedArgs) => Promise<void>
*/

const outdated /*: Outdated */ = async ({root, logger = console.log}) => {
  const {projects} = await getManifest({root});
  const locals = await getAllDependencies({root, projects});
  const map = {};
  const types = ['dependencies', 'devDependencies'];
  for (const local of locals) {
    for (const type of types) {
      if (local.meta[type]) {
        for (const name in local.meta[type]) {
          if (!map[name]) map[name] = new Set();
          map[name].add(local.meta[type][name]);
        }
      }
    }
  }
  // report local discrepancies
  for (const name in map) {
    const local = locals.find(local => local.meta.name === name);
    if (local) {
      const {version} = local.meta;
      for (const range of map[name]) {
        if (version !== range) logger(name, range, version);
      }
    }
  }
  // then report registry discrepancies
  for (const name in map) {
    const local = locals.find(local => local.meta.name === name);
    if (!local) {
      const query = `${node} ${yarn} npm info ${name} -f version --json 2>/dev/null`;
      let latest;
      try {
        const meta = JSON.parse(await exec(query));
        latest = meta.version;
      } catch (e) {
        continue;
      }
      if (latest) {
        for (const range of map[name]) {
          if (!validRange(range) || !validRange(latest)) {
            continue;
          }
          if (gt(latest, minVersion(range))) logger(name, range, latest);
        }
      }
    }
  }
};

module.exports = {outdated};
