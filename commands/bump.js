// @flow
const {inc} = require('../vendor/semver');
const {assertProjectDir} = require('../utils/assert-project-dir.js');
const {getManifest} = require('../utils/get-manifest.js');
const {getDownstreams} = require('../utils/get-downstreams.js');
const {exec, write, read} = require('../utils/node-helpers.js');
const {node, yarn} = require('../utils/binary-paths.js');
const {upgrade} = require('./upgrade.js');

/*::
type BumpArgs = {
  root: string,
  cwd: string,
  type: string,
  frozenPackageJson?: boolean,
}
type Bump = (BumpArgs) => Promise<void>
*/

const bump /*: Bump */ = async ({
  root,
  cwd,
  type,
  frozenPackageJson = false,
}) => {
  await assertProjectDir({dir: cwd});

  const {projects} = await /*:: await */ getManifest({root});

  const dirs = projects.map(dir => `${root}/${dir}`);
  const deps = await Promise.all([
    ...dirs.map(async dir => {
      const meta = JSON.parse(await read(`${dir}/package.json`, 'utf8'));
      return {dir, meta, depth: 1};
    }),
  ]);
  const dep = deps.find(({dir}) => dir === cwd);
  const downstreams = await getDownstreams({
    deps,
    dep,
    excludeWorkspaceDeps: true,
  });
  downstreams.push(dep);

  const types = /^(major|premajor|minor|preminor|patch|prepatch|prerelease|none)$/;
  if (!types.test(type)) {
    throw new Error(
      `Invalid bump type: ${type}. Must be major, premajor, minor, preminor, patch, prepatch, prerelease or none`
    );
  }

  const options = {cwd: root, env: process.env};
  for (const dep of downstreams) {
    const query = `${node} ${yarn} npm info ${dep.meta.name} --json`;
    const data = await exec(query, options).catch(() => null);
    const version = parseVersion(data);
    const old = dep.meta.version;
    const next = type === 'none' ? version : inc(version, type);

    if (next !== old) {
      if (frozenPackageJson) {
        throw new Error(
          `Cannot bump version when frozenPackageJson is true. You most likely forgot to bump a dependency's version locally`
        );
      }

      if (!dep.meta.private) dep.meta.version = next;
      else
        console.log(
          `${dep.meta.name} is a dependency of ${cwd} but it is marked as private, thus cannot be published.`
        );
      await write(
        `${dep.dir}/package.json`,
        JSON.stringify(dep.meta, null, 2),
        'utf8'
      );

      await upgrade({
        root,
        cwd,
        args: [`${dep.meta.name}@${dep.meta.version}`],
      });
    }
  }
};

const parseVersion = data => {
  const versions = data ? JSON.parse(data).versions : [];
  return versions.length > 0 ? versions.pop() : '0.0.0';
};

module.exports = {bump};
