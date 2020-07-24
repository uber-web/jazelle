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

const root = process.cwd();
const [node, , main, , command, distPaths, gen, out, ...args] = process.argv;

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
    return;
  }
  if (command === 'run') {
    command = args.shift();
  }
  runCommand(scripts[`pre${command}`]);
  runCommand(scripts[command], args);
  runCommand(scripts[`post${command}`]);
}

// TODO: maybe change logic to require usage of `yarn thing` in package.json?
// This could reduce overhead
function runCommand(command, args = []) {
  if (command) {
    const matchingBin = getYarnBin(command.split(' ')[0]);
    const yarnCmd = matchingBin ? 'run' : 'exec';
    const script = `yarn ${yarnCmd} ${command} ${args.join(' ')}`;
    try {
      exec(script, {cwd: main, env: process.env, stdio: 'inherit'});
    } catch (e) {
      if (typeof e.status === 'number') {
        process.exit(e.status);
      } else {
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

function getYarnBin(command) {
  try {
    // TODO: replace yarn with correct executable path?
    return exec(`yarn bin ${command}`, {cwd: main}).toString();
  } catch (e) {
    return null;
  }
}
