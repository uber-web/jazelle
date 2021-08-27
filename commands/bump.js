// @flow
const {inc} = require('../vendor/semver');
const {assertProjectDir} = require('../utils/assert-project-dir.js');
const {getManifest} = require('../utils/get-manifest.js');
const {write} = require('../utils/node-helpers.js');
const {getUpstreams} = require('../utils/get-upstreams.js');

/*::
type BumpArgs = {
  root: string,
  cwd: string,
  type: string,
}
type Bump = (BumpArgs) => Promise<void>
*/

const bump /*: Bump */ = async ({root, cwd, type}) => {
  await assertProjectDir({dir: cwd});

  const {projects} = await getManifest({root});
  const upstreams = await getUpstreams({
    target: cwd,
    dirs: projects.map(dir => `${root}/${dir}`),
  });

  const types = /^(major|premajor|minor|preminor|patch|prepatch|prerelease|none)$/;
  if (!types.test(type)) {
    throw new Error(
      `Invalid bump type: ${type}. Must be major, premajor, minor, preminor, patch, prepatch, prerelease or none`
    );
  }

  for (const dep of upstreams) {
    const version = dep.meta.version;
    const nextVersion =
      type === 'none' || dep.meta.private ? version : inc(version, type);
    dep.meta.version = nextVersion;
    for (const nestedDep of upstreams) {
      const fields = ['dependencies', 'devDependencies'];
      for (const field of fields) {
        const deps = nestedDep.meta[field] || {};
        if (deps[dep.meta.name]) {
          nestedDep.meta[field][dep.meta.name] = nextVersion;
        }
      }
    }
  }
  for (const dep of upstreams) {
    await write(
      `${dep.dir}/package.json`,
      JSON.stringify(dep.meta, null, 2),
      'utf8'
    );
  }
};

module.exports = {bump};
