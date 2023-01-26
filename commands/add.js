// @flow
const {resolve} = require('path');
const semver = require('../utils/cached-semver');
const {assertProjectDir} = require('../utils/assert-project-dir.js');
const {getPassThroughArgs} = require('../utils/parse-argv.js');
const {read, spawn} = require('../utils/node-helpers.js');
const {findLocalDependency} = require('../utils/find-local-dependency.js');
const {getManifest} = require('../utils/get-manifest.js');
const {getAllDependencies} = require('../utils/get-all-dependencies.js');
const {getLocalDependencies} = require('../utils/get-local-dependencies.js');
const {
  generateBazelBuildRules,
} = require('../utils/generate-bazel-build-rules.js');
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

  const additions = [];
  const params = getPassThroughArgs(args);
  await Promise.all(
    params.map(async param => {
      const [, name = '', version] = param.match(/(@?[^@]*)@?(.*)/) || [];
      const local = await findLocalDependency({root, name});
      if (local && (!version || local.meta.version === version)) {
        additions.push({name, range: 'workspace:*'});
      } else {
        additions.push({name, range: version});
      }
    })
  );

  const {projects, dependencySyncRule} = /*:: await */ await getManifest({
    root,
  });

  // if dependency exists in web-code, take latest version
  const allDeps = /*:: await */ await getAllDependencies({root, projects});
  additions.forEach(item => {
    if (!item.range) {
      const existingRange = allDeps
        .reduce((ranges, dep) => {
          if (dep.meta.dependencies && dep.meta.dependencies[item.name]) {
            ranges.push(dep.meta.dependencies[item.name]);
          } else if (
            dep.meta.devDependencies &&
            dep.meta.devDependencies[item.name]
          ) {
            ranges.push(dep.meta.devDependencies[item.name]);
          }
          return ranges;
        }, [])
        .sort((l, r) => {
          return semver.compare(semver.coerce(l), semver.coerce(r));
        })
        .pop();
      if (existingRange) {
        item.range = existingRange;
      }
    }
  });

  const meta = JSON.parse(await read(`${cwd}/package.json`, 'utf8'));

  // add external deps
  if (additions.length > 0) {
    const keys = additions.map(({name, range}) => {
      return name + (range ? `@${range}` : '');
    });
    const flags = dev ? ['--dev'] : [];
    const options = {cwd: root, stdio: 'inherit'};
    await spawn(
      node,
      [yarn, 'workspace', meta.name, 'add', ...keys, ...flags],
      options
    );
    // reload package.json affected by workspace add command
    const allDeps = /*:: await */ await getAllDependencies({root, projects});
    const dep = allDeps.find(item => item.dir === cwd);
    if (dep) dep.meta = JSON.parse(await read(`${cwd}/package.json`));
    await spawn(node, [yarn, 'install', '--mode', 'update-lockfile'], {
      cwd: root,
      stdio: 'ignore',
      detached: true,
    });

    const deps = /*:: await */ await getLocalDependencies({
      data: allDeps,
      dirs: projects.map(dir => `${root}/${dir}`),
      target: resolve(root, cwd),
    });
    await generateBazelBuildRules({root, deps, projects, dependencySyncRule});
  }
};

module.exports = {add};
