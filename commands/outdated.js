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

type Result = {
  name: string,
  range: Array<string>,
  latest: string,
};
*/

/**
 * Partitions the provided array into an array-of-arrays with inner arrays
 * of size chunkSize or smaller.
 */
const partition /*: <T: any>(Array<T>, number) => Array<Array<T>> */ = (
  arr,
  chunkSize
) => {
  return [].concat.apply(
    [],
    arr.map(function (elem, i) {
      return i % chunkSize ? [] : [arr.slice(i, i + chunkSize)];
    })
  );
};

/**
 * An async implementation that mirrors Array.prototype.forEach.
 */
const forEachAsync /*: <TSrc: any, TDest: any>(Array<TSrc>, TSrc => Promise<TDest>) => Promise<void> */ = async (
  arr,
  callback
) => {
  await Promise.all(arr.map(callback));
};

/**
 * Fetches metadata for the provided packages via the 'npm info' command.
 */
const fetchInfo = async (
  packages /*: Array<string> */,
  batchSize = 10
) /*: Promise<{ [string]: {[string]: mixed} }> */ => {
  let queries = {};
  const setLatest = data => {
    try {
      const parsed /*: { [string]: string } */ = JSON.parse(data);
      queries[parsed.name] = parsed;
    } catch (e) {
      /*do nothing*/
    }
  };

  await forEachAsync(partition(packages, batchSize), async group => {
    const flags = '-f version --json';
    const cmd = `${node} ${yarn} npm info "${group.join(`" "`)}" ${flags}`;
    try {
      const result = await exec(cmd, {maxBuffer: 5 * 1024 * 1024});
      result
        .trim()
        .split('\n')
        .forEach(data => {
          setLatest(data);
        });
    } catch (e) {
      /* a single failure can cause the exec call to throw an exception.  In those
       * cases, attempt to fetch for each package individually and only skip the
       * failing package */
      if (batchSize > 1) {
        Object.assign(queries, await fetchInfo(group, 1));
      }
    }
  });
  return queries;
};

const outdated /*: Outdated */ = async ({root, logger = console.log}) => {
  const {projects} = await getManifest({root});
  const locals = await getAllDependencies({root, projects});
  const getLocal = name => locals.find(local => local.meta.name === name);
  const map /*: {[string]: Set<string>} */ = {};
  const types = ['dependencies', 'devDependencies'];
  const results /*: Array<Result> */ = [];

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

  // handle local discrepancies
  for (const name in map) {
    const local = getLocal(name);
    if (local) {
      const {version} = local.meta;
      const outOfDate = [...map[name]].filter(
        (consumed /*: string */) => consumed !== version
      );
      if (outOfDate.length > 0) {
        results.push({name, range: outOfDate, latest: version});
      }
    }
  }

  // handle registry discrepancies
  const info = await fetchInfo(
    Object.keys(map).filter((pckg /*: string */) => !getLocal(pckg))
  );

  for (const name in info) {
    const latest = info[name].version;
    if (latest && typeof latest === 'string') {
      for (const range of map[name]) {
        if (!validRange(range) || !validRange(latest)) {
          continue;
        }
        if (gt(latest, minVersion(range))) {
          results.push({name, range: [range], latest});
        }
      }
    }
  }

  // report discrepancies
  for (const {name, range, latest} of results) {
    logger(name, range[0], latest);
  }
};

module.exports = {outdated};
