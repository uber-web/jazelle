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
export type FocusArgs = {
  root: string,
  cwd: string,
  args: Array<string>,
  skipPreinstall?: boolean,
  skipPostinstall?: boolean,
  verbose?: boolean,
}
export type Focus = (FocusArgs) => Promise<void>
*/
const focus /*: Focus */ = async ({
  root,
  cwd,
  args,
  skipPreinstall,
  skipPostinstall,
  verbose,
}) => {
  const {
    projects,
    versionPolicy,
    hooks = {},
    workspace,
    dependencySyncRule,
  } = /*:: await */ await getManifest({root});

  const all = /*:: await */ await getAllDependencies({root, projects});
  const singleDep = args.length === 1 ? all.find(({meta}) => meta.name === args[0]) : null;
  if (singleDep != null) cwd = singleDep.dir;

  const isRootInstall = root === cwd;

  if (!isRootInstall) {
    await assertProjectDir({dir: cwd});
  }

  if (!isRootInstall) {
    validateRegistration({root, cwd, projects});
  }

  if (hooks.bool_shouldinstall) {
    const hookResult = await executeHook(hooks.bool_shouldinstall, root, {
      isBooleanHook: true,
    });

    if (hookResult === false) {
      return;
    }
  }

  const deps = isRootInstall
    ? all
    : /*:: await */ await getLocalDependencies({
        data: all,
        dirs: projects.map(dir => `${root}/${dir}`),
        target: resolve(root, cwd),
      });

  validateDeps({deps});
  await validateVersionPolicy({dirs: deps.map(dep => dep.dir), versionPolicy});

  if (workspace === 'sandbox') {
    await generateBazelignore({root});
    await generateBazelBuildRules({
      root,
      deps,
      projects,
      dependencySyncRule,
    });
  }

  if (skipPreinstall === false) {
    await executeHook(hooks.preinstall, root);
  }

  const env = process.env;
  const path = dirname(node) + ':' + String(process.env.PATH);
  const spawnArgs = [yarn, 'workspaces', 'focus', ...args];

  if (verbose) {
    await spawn(node, spawnArgs, {
      env: {...env, PATH: path},
      cwd: root,
      stdio: 'inherit',
      filterOutput(line) {
        return validateYarnWorkspaceToolsInstallation(line);
      }
    });
  } else {
    await spawn(node, spawnArgs, {
      // FORCE_COLOR is for the chalk package used by yarn
      env: {...env, PATH: path, FORCE_COLOR: '1'},
      cwd: root,
      filterOutput(line, type) {
        return validateYarnWorkspaceToolsInstallation(line) && (
          !/doesn't provide .+ requested by /.test(line) &&
          !/provides .+ requested by /.test(line) &&
          !/can't be found in the cache and will be fetched/.test(line)
        );
      },
    });
  }

  if (skipPostinstall === false) {
    await executeHook(hooks.postinstall, root);
  }

  // ensure lockfile is updated for all projects
  await spawn(node, [yarn, 'install', '--mode', 'update-lockfile'], {
    env: {...env, PATH: path},
    cwd: root,
    stdio: 'ignore',
    detached: true,
  });
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

const validateVersionPolicy = async ({dirs, versionPolicy}) => {
  const result = await reportMismatchedTopLevelDeps({
    dirs,
    versionPolicy,
  });
  if (!result.valid) throw new Error(getErrorMessage(result, false));
};

const validateYarnWorkspaceToolsInstallation = line => {
  if (/Command not found/.test(line)) {
    throw new Error('Focus command isn\'t setup. Use Yarn v2+ and run `yarn plugin import workspace-tools`');
  }
  return true;
}

module.exports = {focus};
