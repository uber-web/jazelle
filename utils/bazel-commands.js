// @flow
const {relative, basename, dirname} = require('path');
const {bazel, node} = require('./binary-paths.js');
const {spawn} = require('./node-helpers.js');
const {spawnFiltered} = require('./spawn-filtered.js');

const startupFlags = ['--host_jvm_args=-Xmx15g'];

// when using `spawnFiltered` with bazel, `--color=yes` needs to be passed
// to force terminal colors
function ensureColorArg(args) {
  if (!args.find(arg => arg.includes('--color'))) {
    args.push('--color=yes');
  }
  return args;
}

/*::
import type {Stdio} from './node-helpers.js';

export type BuildArgs = {
  root: string,
  cwd: string,
  name?: string,
  stdio?: Stdio,
  verbose?: boolean,
};
export type Build = (BuildArgs) => Promise<void>;
*/
const build /*: Build */ = async ({
  root,
  cwd,
  name = basename(cwd),
  stdio,
  verbose = false,
}) => {
  cwd = relative(root, cwd);
  await spawnFiltered(
    bazel,
    ensureColorArg([
      ...startupFlags,
      'build',
      `//${cwd}:${name}`,
      '--sandbox_debug',
    ]),
    {
      spawnOpts: {
        stdio,
        env: process.env,
        cwd: root,
      },
      verbose,
    }
  );
};

/*::
export type TestArgs = {
  root: string,
  cwd: string,
  args: Array<string>,
  name?: string,
  stdio?: Stdio,
  verbose?: boolean,
};
type Test = (TestArgs) => Promise<void>;
*/
const test /*: Test */ = async ({
  root,
  cwd,
  args,
  name = 'test',
  stdio,
  verbose = false,
}) => {
  cwd = relative(root, cwd);
  const testParams = args.map(arg => `--test_arg=${arg}`);
  await spawnFiltered(
    bazel,
    [
      ...startupFlags,
      'run',
      `//${cwd}:${name}`,
      '--sandbox_debug',
      ...testParams,
    ],
    {
      spawnOpts: {
        stdio,
        env: process.env,
        cwd: root,
      },
      verbose,
    }
  );
};

/*::
export type RunArgs = {
  root: string,
  cwd: string,
  args: Array<string>,
  name?: string,
  stdio?: Stdio,
  verbose?: boolean,
};
type Run = (RunArgs) => Promise<void>;
*/
const run /*: Run */ = async ({
  root,
  cwd,
  args,
  name = basename(cwd),
  stdio,
  verbose = false,
}) => {
  cwd = relative(root, cwd);
  const runParams = args.length > 0 ? ['--', ...args] : [];
  await spawnFiltered(
    bazel,
    ensureColorArg([
      ...startupFlags,
      'run',
      `//${cwd}:${name}`,
      '--sandbox_debug',
      ...runParams,
    ]),
    {
      spawnOpts: {
        stdio,
        env: process.env,
        cwd: root,
      },
      verbose,
    }
  );
};

/*::
export type DevArgs = {
  root: string,
  cwd: string,
  args: Array<string>,
  stdio?: Stdio,
  verbose?: boolean,
};
type Dev = (DevArgs) => Promise<void>;
*/
const dev /*: Dev */ = async ({root, cwd, args, stdio, verbose = false}) => {
  await run({root, cwd, args, name: 'dev', stdio, verbose});
};

/*::
export type LintArgs = {
  root: string,
  cwd: string,
  args: Array<string>,
  stdio?: Stdio,
  verbose?: boolean,
};
type Lint = (LintArgs) => Promise<void>;
*/
const lint /*: Lint */ = async ({root, cwd, args, stdio, verbose = false}) => {
  await run({root, cwd, args, name: 'lint', stdio, verbose});
};

/*::
export type FlowArgs = {
  root: string,
  cwd: string,
  args: Array<string>,
  stdio?: Stdio,
  verbose?: boolean,
};
type Flow = (FlowArgs) => Promise<void>;
*/
const flow /*: Flow */ = async ({root, cwd, args, stdio, verbose = false}) => {
  await run({root, cwd, args, name: 'flow', stdio, verbose});
};

/*::
export type StartArgs = {
  root: string,
  cwd: string,
  args: Array<string>,
  stdio?: Stdio,
  verbose?: boolean,
};
type Start = (StartArgs) => Promise<void>;
*/
const start /*: Start */ = async ({
  root,
  cwd,
  args,
  stdio,
  verbose = false,
}) => {
  await run({root, cwd, args, stdio, verbose});
};

/*::
export type ExecArgs = {
  root: string,
  cwd: string,
  args: Array<string>,
  stdio?: Stdio,
  verbose?: boolean,
}
export type Exec = (ExecArgs) => Promise<void>;
*/
const exec /*: Exec */ = async ({root, cwd, args, stdio, verbose = false}) => {
  const [command, ...params] = args;
  const path = process.env.PATH || '';
  const bazelDir = dirname(bazel);
  const nodeDir = dirname(node);
  const env = {
    ...process.env,
    PATH: `${bazelDir}:${nodeDir}:${path}`,
  };
  await spawn(command, params, {cwd, env, stdio});
};

/*::
export type ScriptArgs = {
  root: string,
  cwd: string,
  command: string,
  args: Array<string>,
  stdio?: Stdio,
  verbose?: boolean,
};
type Script = (ScriptArgs) => Promise<void>;
*/
const script /*: Script */ = async ({
  root,
  cwd,
  command,
  args,
  stdio,
  verbose = false,
}) => {
  await run({
    root,
    cwd,
    args: [command, ...args],
    name: 'script',
    stdio,
    verbose,
  });
};

module.exports = {
  startupFlags,
  build,
  test,
  lint,
  flow,
  dev,
  start,
  run,
  exec,
  script,
};
