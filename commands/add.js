// @flow
const {resolve, relative} = require('path');
const {assertProjectDir} = require('../utils/assert-project-dir.js');
const {getPassThroughArgs} = require('../utils/parse-argv.js');
const {read, write, spawn} = require('../utils/node-helpers.js');
const {findLocalDependency} = require('../utils/find-local-dependency.js');
const {sortPackageJson} = require('../utils/sort-package-json.js');
const {getManifest} = require('../utils/get-manifest.js');
const {getLocalDependencies} = require('../utils/get-local-dependencies.js');
const {generateBazelBuildRules} = require('../utils/generate-bazel-build-rules.js');
const {node, yarn} = require('../utils/binary-paths.js');

/*
adding local dep should:
- add it to the project's package.json, pointing to the exact local version
- update the BUILD.bazel file `deps` field
- not add it to the project's yarn.lock
*/

/*::
export type AddArgs = {
  root: string,
  cwd: string,
  args: Array<string>,
  version?: string,
  dev?: boolean,
};
export type Add = (AddArgs) => Promise<void>;
*/
const add /*: Add */ = async ({root, cwd, args, dev = false}) => {
  await assertProjectDir({dir: cwd});

  const type = dev ? 'devDependencies' : 'dependencies';

  // group by whether the dep is local (listed in manifest.json) or external (from registry)
  const locals = [];
  const externals = [];
  const params = getPassThroughArgs(args);
  for (const param of params) {
    let [, name, version] = param.match(/(@?[^@]*)@?(.*)/) || [];
    const local = await findLocalDependency({root, name});
    if (local && (!version || local.meta.version === version)) {
      locals.push({local, name});
    } else {
      externals.push({name, range: version, type});
    }
  }

  // add local deps
  if (locals.length > 0) {
    const meta = JSON.parse(await read(`${cwd}/package.json`, 'utf8'));
    if (!meta[type]) meta[type] = {};

    for (const {local, name} of locals) {
      // update existing entries
      const types = [
        'dependencies',
        'devDependencies',
        'peerDependencies',
        'optionalDependencies',
        'resolutions',
      ];
      for (const t of types) {
        if (meta[t] && meta[t][name]) {
          meta[t][name] = `workspace:${local.meta.name}`;
        }
      }
      meta[type][name] = `workspace:${local.meta.name}`;
    }
    await write(`${cwd}/package.json`, sortPackageJson(meta), 'utf8');

    const {projects, dependencySyncRule} = /*:: await */ await getManifest({root});
    const deps = /*:: await */ await getLocalDependencies({
      root,
      dirs: projects.map(dir => `${root}/${dir}`),
      target: resolve(root, cwd),
    });
    await generateBazelBuildRules({root, deps, projects, dependencySyncRule});
  }

  // add external deps
  if (externals.length > 0) {
    const deps = externals.map(({name, range}) => {
      return name + (range ? `@${range}` : '');
    });
    const name = relative(root, cwd);
    const flags = dev ? ['--dev'] : [];
    const cmdArgs = [yarn, 'workspace', name, 'add', ...deps, ...flags];
    const options = {cwd: root, stdio: 'inherit'};
    await spawn(node, cmdArgs, options);
  }
};

module.exports = {add};
