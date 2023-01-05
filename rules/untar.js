// @flow
const {
  realpathSync: realpath,
  statSync: stat,
  readFileSync,
  existsSync: exists,
  mkdirSync: mkdir,
  readdirSync: ls,
  copyFileSync: cp,
} = require('fs');
const {execSync: exec} = require('child_process');
const {dirname, resolve, relative} = require('path');

const root = process.cwd();
const [runtime] = process.argv.slice(2);

const options = {cwd: root, encoding: 'utf8', maxBuffer: 1e9};
const files = exec(`find . -name __jazelle__*.tgz`, options)
  .split('\n')
  .filter(Boolean);

// TODO this file can be optimized with some parallelization
files.map(file => {
  untarIntoSandbox(file);
  if (runtime) {
    copyToSourceFolder(file);
  }
});

function untarIntoSandbox(file) {
  const target = resolve(root, dirname(file));
  const untar = `tar xzf "${file}" -C "${target}"`;
  // untar into the bazel-out directory
  exec(untar, {cwd: root, stdio: 'inherit'});

  // when in the build phase, we must also untar into the sandbox runtime dir
  // if we only untar into the bazel-out/ dir, other builds steps will not be able to depend
  // on the output of this build step.
  if (!runtime) {
    const relativeDir = relative(process.env.BAZEL_BIN_DIR || '', target);
    const buildTargetDir = resolve(process.env.PWD || '', relativeDir);
    exec(`tar xzf "${file}" -C "${buildTargetDir}"`);
  }
}

function copyToSourceFolder(file) {
  const target = resolve(root, dirname(file));
  const real = dirname(realpath(`${target}/package.json`));
  const files = exec(`tar ztf ${file} | sort`, {encoding: 'utf8'})
    .trim()
    .split('\n')
    .map(line => line.replace(/\/$/, ''));
  for (const file of files) {
    copy(target, real, file);
  }
}

function copy(target, real, file) {
  const targetPath = `${target}/${file}`;
  if (!exists(targetPath)) return;
  if (stat(targetPath).isDirectory()) {
    const srcPath = `${real}/${file}`;
    if (!exists(srcPath)) mkdir(srcPath);
    for (const child of ls(srcPath)) {
      copy(target, real, `${file}/${child}`);
    }
  } else {
    // only overwrite file if it's not identical
    if (read(`${target}/${file}`) !== read(`${real}/${file}`)) {
      const srcPath = `${real}/${file}`;
      const srcDir = dirname(srcPath);
      if (!exists(srcDir)) {
        mkdir(srcDir);
      }
      cp(`${target}/${file}`, `${real}/${file}`);
    }
  }
}

function read(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch (e) {
    return Symbol('not found'); // must return something that does not equal itself
  }
}
