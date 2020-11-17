// @flow
const {
  existsSync: exists,
  readFileSync: read,
  readdirSync: readdir,
  realpathSync: realpath,
  statSync: stat,
} = require('fs');
const {execSync: exec} = require('child_process');
const {dirname, join, relative} = require('path');
const {yarn} = require('../utils/binary-paths.js');

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

if (out) {
  runCommands(command, args);
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
  runCommands(command, args);
  // handle `gen_srcs`:
  // - if the command generates file (e.g. jest snapshots), copy them back to the source dir
  // - if the files already exist, they are updated through Bazel's symlink and the copy is not needed
  generateSources({root, main, regexes: gen.split('|').filter(Boolean)});
}

function runCommands(command, args) {
  if (command.startsWith('yarn ')) {
    runCommand(command.substr(5), args);
  } else {
    if (command === 'run') {
      command = args.shift();
    }
    runCommand(command, args);
  }
}

function runCommand(command, args = []) {
  const params = args.map(arg => `'${arg}'`).join(' ');
  const options = {cwd: main, env: process.env, stdio: 'inherit'};
  if (command in scripts) {
    // is it a real script in package.json
    try {
      // yarn run [command] incorrectly runs with the original cwd instead of sandbox
      // yarn exec [scripts[command]] runs with sandbox cwd, as expected
      exec(`${node} ${yarn} run ${command} ${params}`, options);
    } catch (e) {
      if (typeof e.status === 'number') {
        process.exit(e.status);
      } else {
        process.exit(1);
      }
    }
  } else {
    if (command.includes('rpc-cli')) {
      if (command.includes('${NODE}')) {
        command = command
          .split('${NODE}')
          .join(`node -r ${join(rootDir, '.pnp.js')}`);
      }
      if (command.includes('${ROOT_DIR}')) {
        command = command.split('${ROOT_DIR}').join(rootDir);
      }
      try {
        exec(command, options);
      } catch (e) {
        process.exit(1);
      }
    }
  }
}

function generateSources({root, main, regexes}) {
  const dir = dirname(relative(root, `${main}/package.json`));
  const realDir = dirname(realpath(`${main}/package.json`));
  const relSandbox = relative(root, dir);
  const real = realDir.replace(`/${relSandbox}`, '');
  for (const regex of regexes) {
    const sandboxed = find({root, regex: new RegExp(regex)});
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
