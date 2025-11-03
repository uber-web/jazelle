// @flow
const {getManifest} = require('../utils/get-manifest.js');
const {getAllDependencies} = require('../utils/get-all-dependencies.js');
const {exec} = require('../utils/node-helpers.js');
const {node, yarn} = require('../utils/binary-paths.js');
const {minVersion, gt, validRange} = require('../utils/cached-semver');

/*::
type OutdatedArgs = {
  root: string,
  json?: boolean,
  dedup?: boolean,
  limit?: number,
  logger?: (...data: Array<mixed>) => void | mixed
};
type Outdated = (OutdatedArgs) => Promise<void>

type Version = string;
type Result = {
  packageName: string,
  installed: Array<Version>,
  latest: Version,
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
const forEachAsync /*: <TSrc: any, TDest: any>(Array<TSrc>, TSrc => Promise<TDest>) => Promise<void> */ =
  async (arr, callback) => {
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

const outdated /*: Outdated */ = async ({
  root,
  json = false,
  dedup = false,
  limit = 100,
  logger = console.log,
}) => {
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
        results.push({
          packageName: name,
          installed: outOfDate,
          latest: version,
        });
      }
    }
  }

  // handle registry discrepancies
  const externalPackages = Object.keys(map).filter(
    (pckg /*: string */) => !getLocal(pckg)
  );
  let info /*: { [string]: { [string]: mixed } } */ = {};
  const partitions = partition(externalPackages, limit);
  for (const part of partitions) {
    Object.assign(info, await fetchInfo(part));
  }

  for (const name in info) {
    const latest = info[name].version;
    if (latest && typeof latest === 'string' && validRange(latest)) {
      const outdated = [];
      for (const version of map[name]) {
        if (validRange(version) && gt(latest, minVersion(version))) {
          outdated.push(version);
        }
      }
      if (outdated.length > 0) {
        results.push({packageName: name, installed: outdated, latest});
      }
    }
  }

  // report discrepancies
  if (json) logger('[');

  results.forEach((result, resultIndex) => {
    const formatted = [];
    if (dedup) {
      formatted.push(result);
    } else {
      result.installed.forEach(version =>
        formatted.push({
          ...result,
          installed: [version],
        })
      );
    }

    formatted.forEach((entry, i) => {
      if (json) {
        const needsComma =
          i < formatted.length - 1 || resultIndex < results.length - 1;
        logger(JSON.stringify(entry) + (needsComma ? ',' : ''));
      } else {
        logger(entry.packageName, entry.installed.join(' '), entry.latest);
      }
    });
  });
  if (json) logger(']');
};

module.exports = {outdated};
