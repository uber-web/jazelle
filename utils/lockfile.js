// @flow
const {read} = require('./node-helpers.js');

/*::
export type Report = {
  [dependency: string]: {
    [version: string]: Array<string> // list of projects
  }
};
export type CheckArgs = {
  roots: Array<string>,
  all?: boolean
};
export type Check = (CheckArgs) => Promise<Report>;
*/
const check /*: Check */ = async ({roots, all}) => {
  const versions = {};
  function collectVersions(meta, type) {
    Object.keys(meta[type] || {}).forEach(name => {
      const version = meta[type][name];
      if (!versions[name]) versions[name] = {};
      if (!versions[name][version]) versions[name][version] = [];
      versions[name][version].push(meta.name);
      versions[name][version].sort();
    });
  }

  await Promise.all(
    roots.map(async dir => {
      const meta = JSON.parse(await read(`${dir}/package.json`, 'utf8'));
      collectVersions(meta, 'dependencies');
      collectVersions(meta, 'devDependencies');
      collectVersions(meta, 'optionalDependencies');
    })
  );

  if (!all) {
    Object.keys(versions).forEach(name => {
      if (Object.keys(versions[name]).length === 1) delete versions[name];
    });
  }

  return versions;
};

module.exports = {check};
