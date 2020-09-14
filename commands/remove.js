// @flow
const {resolve} = require('path');
const {assertProjectDir} = require('../utils/assert-project-dir.js');
const {getPassThroughArgs} = require('../utils/parse-argv.js');
const {getManifest} = require('../utils/get-manifest.js');
const {getLocalDependencies} = require('../utils/get-local-dependencies.js');
const {
  generateBazelBuildRules,
} = require('../utils/generate-bazel-build-rules.js');
const {read, spawn} = require('../utils/node-helpers.js');
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
  const meta = JSON.parse(await read(`${cwd}/package.json`, 'utf8'));
  const params = getPassThroughArgs(args);
  if (params.length > 0) {
    const cmdArgs = [yarn, 'workspace', meta.name, 'remove', ...params];
    await spawn(node, cmdArgs, {cwd: root, stdio: 'inherit'});

    const {projects, dependencySyncRule} = /*:: await */ await getManifest({
      root,
    });
    const deps = /*:: await */ await getLocalDependencies({
      dirs: projects.map(dir => `${root}/${dir}`),
      target: resolve(root, cwd),
    });
    await generateBazelBuildRules({root, deps, projects, dependencySyncRule});
  }
};

module.exports = {remove};
