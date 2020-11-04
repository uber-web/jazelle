// @flow
const {resolve, dirname} = require('path');
const {spawn} = require('../utils/node-helpers');
const {assertProjectDir} = require('../utils/assert-project-dir.js');
const {getManifest} = require('../utils/get-manifest.js');
const {getLocalDependencies} = require('../utils/get-local-dependencies.js');
const {getAllDependencies} = require('../utils/get-all-dependencies.js');
const {
  reportMismatchedTopLevelDeps,
  getErrorMessage,
} = require('../utils/report-mismatched-top-level-deps.js');
const {detectCyclicDeps} = require('../utils/detect-cyclic-deps.js');
const {generateBazelignore} = require('../utils/generate-bazelignore.js');
const {
  generateBazelBuildRules,
} = require('../utils/generate-bazel-build-rules.js');
const {executeHook} = require('../utils/execute-hook.js');
const {node, yarn} = require('../utils/binary-paths.js');

/*::
export type InstallArgs = {
  root: string,
  cwd: string,
  frozenLockfile?: boolean,
  conservative?: boolean,
  skipPreinstall?: boolean,
  skipPostinstall?: boolean,
}
export type Install = (InstallArgs) => Promise<void>
*/
const install /*: Install */ = async ({
  root,
  cwd,
  frozenLockfile = false,
  conservative = true,
  skipPreinstall = false,
  skipPostinstall = false,
}) => {
  await assertProjectDir({dir: cwd});

  const {
    projects,
    versionPolicy,
    hooks = {},
    workspace,
    dependencySyncRule,
  } = /*:: await */ await getManifest({root});

  validateRegistration({root, cwd, projects});

  const deps = /*:: await */ await getLocalDependencies({
    root,
    dirs: projects.map(dir => `${root}/${dir}`),
    target: resolve(root, cwd),
  });

  validateDeps({deps});
  await validateVersionPolicy({root, projects, versionPolicy});

  if (workspace === 'sandbox' && frozenLockfile === false) {
    const all = await getAllDependencies({root, projects});
    await generateBazelignore({root});
    await generateBazelBuildRules({
      root,
      deps: all,
      projects,
      dependencySyncRule,
    });
  }

  if (skipPreinstall === false) {
    await executeHook(hooks.preinstall, root);
  }
  const env = process.env;
  const path = dirname(node) + ':' + String(process.env.PATH);
  await spawn(node, [yarn, 'install'], {
    env: {...env, PATH: path},
    cwd: root,
    stdio: 'inherit',
  });
  if (skipPostinstall === false) {
    await executeHook(hooks.postinstall, root);
  }
};

const validateRegistration = ({root, cwd, projects}) => {
  if (!projects.find(dir => resolve(`${root}/${dir}`) === cwd)) {
    const registrationError = `Your cwd ${cwd} is not listed in manifest.json. If you are at the wrong directory, cd into your desired directory or use the --cwd flag. If you are in the desired directory, make sure it is listed in the projects field in manifest.json`;
    throw new Error(registrationError);
  }
};

const validateDeps = ({deps}) => {
  // ensure packages have names
  const nameless = deps.find(dep => !dep.meta.name);
  if (nameless) {
    throw new Error(`${nameless.dir}/package.json is missing a name field`);
  }

  // ensure package names are not duplicated
  const names = {};
  for (const dep of deps) {
    if (names[dep.meta.name]) {
      const dupeDir = names[dep.meta.name];
      const error = `Duplicate project name in ${dep.dir} and ${dupeDir}`;
      throw new Error(error);
    }
    names[dep.meta.name] = dep.dir;
  }

  // ensure there's no cyclical deps
  const cycles = detectCyclicDeps({deps});
  if (cycles.length > 0) {
    const cycleError =
      'Cyclic local dependencies detected. Run `jazelle doctor` for more info';
    throw new Error(cycleError);
  }
};

const validateVersionPolicy = async ({root, projects, versionPolicy}) => {
  const result = await reportMismatchedTopLevelDeps({
    root,
    projects,
    versionPolicy,
  });
  if (!result.valid) throw new Error(getErrorMessage(result, false));
};

module.exports = {install};
