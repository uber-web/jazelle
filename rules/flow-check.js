// @flow
const {realpathSync: realpath} = require('fs');
const {execSync: exec, spawnSync: spawn} = require('child_process');
const {dirname} = require('path');
const {yarn} = require('../utils/binary-paths.js');

const root = process.cwd();
const [node, , main, bin, ...args] = process.argv;

const files = exec(`find . -name output.tgz`, {cwd: bin, encoding: 'utf8'})
  .split('\n')
  .filter(Boolean);
files.map(f => {
  const target = `${root}/${dirname(f)}`;
  spawn('tar', ['xzf', f, '-C', target], {cwd: bin});
});

const dir = dirname(realpath(`${main}/package.json`));
spawn(node, [yarn, 'flow', ...args], {
  cwd: dir,
  env: process.env,
  stdio: 'inherit',
});
