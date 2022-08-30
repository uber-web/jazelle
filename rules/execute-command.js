// @flow
const {
  existsSync: exists,
  readFileSync: read,
  readdirSync: readdir,
  realpathSync: realpath,
  statSync: stat,
  symlinkSync: symlink,
} = require('fs');
const {execSync: exec} = require('child_process');
const {dirname, join, relative} = require('path');
const {yarn} = require('../utils/binary-paths.js');
const {spawnOrExit} = require('../utils/node-helpers.js');

const root = process.cwd();
const [
  node,
  ,
  rootDir,
  main,
  ,
  command,
  distPaths,
  gen,
  out,
  ...args
] = process.argv;

const {scripts = {}} = JSON.parse(read(`${main}/package.json`, 'utf8'));
const {scripts: rootScripts = {}} = JSON.parse(
  read(`${rootDir}/package.json`, 'utf8')
);

async function run() {
  if (out) {
    await runCommands(command, args);

    // Bazel doesn't support `out` folders, so compress it into a tarball instead
    const dists = distPaths.split('|').reduce((acc, next) => {
      // This adds support for very simple folder globbing. For example: "src/**/__generated__".
      // We should revisit this with a better long term solution that potentially can handle both dist and gen_srcs attrs.
      if (next.includes('/**/')) {
        const split = next.split('/**/');
        if (split.length > 2) {
          throw new Error(
            `Invalid dist config: ${next}. Multiple ** not supported`
          );
        }
        const [baseDir, regexSource] = split;
        return acc.concat(
          Array.from(
            findMatchingDirs({
              root: join(main, baseDir),
              regex: new RegExp(regexSource),
            })
          ).map(p => relative(main, p))
        );
      }
      acc.push(next);
      return acc;
    }, []);

    const dirsString = dists.map(item => `"${item}"`).join(' ');

    for (const dist of dists) {
      if (!exists(join(main, dist))) {
        exec(`mkdir -p "${dist}"`, {cwd: main});
      }
    }
    exec(`tar czf "${out}" ${dirsString}`, {cwd: main, stdio: 'inherit'});
  } else {
    await runCommands(command, args);
    // handle `gen_srcs`:
    // - if the command generates file (e.g. jest snapshots), copy them back to the source dir
    // - if the files already exist, they are updated through Bazel's symlink and the copy is not needed
    generateSources({root, main, regexes: gen.split('|').filter(Boolean)});
  }
}
run();

async function runCommands(command, args) {
  if (command === 'run') {
    command = args.shift();
  }
  await runCommand(command, args);
}

async function runCommand(command, args = []) {
  const options = {cwd: main, env: process.env, stdio: 'inherit'};

  smuggleLockfile(rootDir);
  if (command in scripts) {
    await spawnOrExit(
      `${node}`,
      [`${yarn}`, 'run', `${command}`, ...args],
      options
    );
  } else if (command.includes('${NODE}')) {
    // Support `build = "${NODE} ${ROOT_DIR}/foo.js"` as a web_binary build argument (instead of a package.json script name)
    const loaderPath = join(rootDir, '.pnp.loader.mjs');
    const loaderArgs = exists(loaderPath) ? `` : `--loader '${loaderPath}'`;

    const exe =
      process.env.NODE_SKIP_PNP === '1'
        ? `${node} ${loaderArgs}`
        : `${node} -r '${join(rootDir, '.pnp.cjs')}' ${loaderArgs}`;
    const cmd = command
      .replace(/\$\{NODE\}/g, exe)
      .replace(/\$\{ROOT_DIR\}/g, rootDir);
    await spawnOrExit(cmd, [], {
      ...options,
      shell: true,
    });
  } else if (command in rootScripts) {
    // if command exists at root level but not at project level, run the root level command instead of erroring
    await spawnOrExit(
      `${node}`,
      [`${yarn}`, 'run', `${command}`, ...args],
      {
        ...options,
        cwd: rootDir,
      }
    );
  } else {
    // do not allow running arbitrary shell commands
    // users should run such commands directly instead of running them through jazelle
    console.error('Invalid command: ' + command);
    process.exitCode = 1;
  }
}

function smuggleLockfile(rootDir) {
  // Support non-hermetic yarn.lock/.pnp.cjs/.pnp.loader.mjs smuggling into sandbox
  // This allows a repo to use yarn plugins to implement custom change detection
  // to avoid invalidating top-level cache in cases where yarn.lock is touched but only affects certain projects
  // See: Lockfile delegation section in README

  try {
    const realRoot = dirname(realpath(`${rootDir}/package.json`)); // FIXME: technically a target may not depend on this file, so it's not actually guaranteed to exist, even though it usually does

    //only smuggle if needed
    const yarnLock = `${rootDir}/yarn.lock`;
    const realYarnLock = `${realRoot}/yarn.lock`;
    if (!exists(yarnLock) && exists(realYarnLock)) {
      symlink(realYarnLock, yarnLock, 'file');
    }
    const pnpCjs = `${rootDir}/.pnp.cjs`;
    const realPnpCjs = `${realRoot}/.pnp.cjs`;
    if (!exists(pnpCjs) && exists(realPnpCjs)) {
      symlink(realPnpCjs, pnpCjs, 'file');
    }
    const pnpLoader = `${rootDir}/.pnp.loader.mjs`;
    const realPnpLoader = `${realRoot}/.pnp.loader.mjs`;
    if (!exists(pnpLoader) && exists(realPnpLoader)) {
      symlink(realPnpLoader, pnpLoader, 'file');
    }
  } catch (e) {
    // smuggling failed, assume yarn.lock exists and keep going
  }
}

function generateSources({root, main, regexes}) {
  const dir = dirname(relative(root, `${main}/package.json`));
  const realDir = dirname(realpath(`${main}/package.json`));
  const relSandbox = relative(root, dir);
  const real = realDir.replace(`/${relSandbox}`, '');
  for (const regex of regexes) {
    const sandboxed = find({root: main, regex: new RegExp(regex)});
    for (const item of sandboxed) {
      const rel = relative(root, item);
      const sandboxedPath = `${root}/${rel}`;
      const gensrcPath = `${real}/${rel}`;
      const copy = `cp -rf ${sandboxedPath} ${gensrcPath}`;
      if (!exists(gensrcPath)) {
        exec(copy, {cwd: root});
      }
      deleteExtraneousFiles({sandboxedPath, gensrcPath});
    }
  }
}

function deleteExtraneousFiles({sandboxedPath, gensrcPath}) {
  const sandboxed = ls(sandboxedPath);
  const generated = ls(gensrcPath);
  const extraneous = [];
  for (const item of generated) {
    if (!sandboxed.includes(item)) {
      extraneous.push(item);
    }
  }
  if (extraneous.length > 0) {
    exec(`rm -rf ${extraneous.join(' ')}`, {cwd: gensrcPath});
  }
}

function ls(dir) {
  try {
    return exec('ls', {cwd: dir, encoding: 'utf8'})
      .trim()
      .split('\n')
      .filter(Boolean);
  } catch (e) {
    return [];
  }
}

function* find({root, regex}) {
  const dirs = readdir(root);
  for (const dir of dirs) {
    const path = `${root}/${dir}`;
    const s = getStat(path);
    if (path.match(regex)) yield path;
    if (s.isDirectory()) yield* find({root: path, regex});
  }
}

function* findMatchingDirs({root, regex}) {
  const dirs = readdir(root);
  for (const dir of dirs) {
    const path = `${root}/${dir}`;
    const s = getStat(path);
    if (path.match(regex)) yield path;
    else if (s.isDirectory()) yield* findMatchingDirs({root: path, regex});
  }
}

function getStat(path) {
  try {
    return stat(path);
  } catch (e) {
    return {
      isDirectory: () => false,
    };
  }
}
