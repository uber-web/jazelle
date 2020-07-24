// @flow
const {resolve, relative} = require('path');
const {assertProjectDir} = require('../utils/assert-project-dir.js');
const {getPassThroughArgs} = require('../utils/parse-argv.js');
const {findLocalDependency} = require('../utils/find-local-dependency.js');
const {sortPackageJson} = require('../utils/sort-package-json.js');
const {getManifest} = require('../utils/get-manifest.js');
const {getLocalDependencies} = require('../utils/get-local-dependencies.js');
const {generateBazelBuildRules} = require('../utils/generate-bazel-build-rules.js');
const {read, write, spawn} = require('../utils/node-helpers.js');
const {node, yarn} = require('../utils/binary-paths.js');

/*::
export type RemoveArgs = {
  root: string,
  cwd: string,
  args: Array<string>,
}
export type Remove = (RemoveArgs) => Promise<void>
*/
const remove /*: Remove */ = async ({root, cwd, args}) => {
  await assertProjectDir({dir: cwd});
  const deps = getPassThroughArgs(args);

  const locals = [];
  const externals = [];
  for (const name of deps) {
    const local = await findLocalDependency({root, name});
    if (local) {
      locals.push(name);
    } else {
      externals.push(name);
    }
  }

  if (locals.length > 0) {
    for (const name of locals) {
      const meta = JSON.parse(await read(`${cwd}/package.json`, 'utf8'));
      removeFromSection(meta, 'dependencies', name);
      removeFromSection(meta, 'devDependencies', name);
      removeFromSection(meta, 'peerDependencies', name);
      removeFromSection(meta, 'optionalDependencies', name);
      await write(`${cwd}/package.json`, sortPackageJson(meta), 'utf8');
    }

    const {projects, dependencySyncRule} = /*:: await */ await getManifest({root});
    const deps = /*:: await */ await getLocalDependencies({
      dirs: projects.map(dir => `${root}/${dir}`),
      target: resolve(root, cwd),
    });
    await generateBazelBuildRules({root, deps, projects, dependencySyncRule});
  }
  if (externals.length > 0) {
    const name = relative(root, cwd);
    spawn(node, [yarn, 'workspace', name, 'remove', ...deps], {cwd: root});
  }
};

const removeFromSection = (meta, type, name) => {
  if (meta[type] && meta[type][name]) {
    delete meta[type][name];
  }
};

module.exports = {remove};
