// @flow
const {relative, basename, dirname, join} = require('path');
const fs = require('fs');
const os = require('os');
const {randomBytes} = require('crypto');
const {bazel, node} = require('./binary-paths.js');
const {spawnOrExit, exec: nodeExec} = require('./node-helpers.js');

/*::
import type {Stdio} from './node-helpers.js';
export type {ExecException as BazelQueryException} from './node-helpers.js';

export type BuildArgs = {
  root: string,
  cwd: string,
  name?: string,
  stdio?: Stdio,
};
export type Build = (BuildArgs) => Promise<void>;
*/
const build /*: Build */ = async ({
  root,
  cwd,
  name = basename(cwd),
  stdio = 'inherit',
}) => {
  cwd = relative(root, cwd);
  await spawnOrExit(bazel, ['build', `//${cwd}:${name}`], {
    stdio,
    env: {...process.env},
    cwd: root,
  });
};

/*::
export type TestArgs = {
  root: string,
  cwd: string,
  args: Array<string>,
  name?: string,
  stdio?: Stdio,
};
type Test = (TestArgs) => Promise<void>;
*/
const test /*: Test */ = async ({
  root,
  cwd,
  args,
  name = 'test',
  stdio = 'inherit',
}) => {
  cwd = relative(root, cwd);
  const testParams = args.map(arg => `--test_arg=${arg}`);
  await spawnOrExit(bazel, ['run', `//${cwd}:${name}`, ...testParams], {
    stdio,
    env: {...process.env},
    cwd: root,
  });
};

/*::
export type RunArgs = {
  root: string,
  cwd: string,
  args: Array<string>,
  name?: string,
  stdio?: Stdio,
};
type Run = (RunArgs) => Promise<void>;
*/
const run /*: Run */ = async ({
  root,
  cwd,
  args,
  name = basename(cwd),
  stdio = 'inherit',
}) => {
  cwd = relative(root, cwd);
  const runParams = args.length > 0 ? ['--', ...args] : [];
  await spawnOrExit(bazel, ['run', `//${cwd}:${name}`, ...runParams], {
    stdio,
    env: {...process.env},
    cwd: root,
  });
};

/*::
export type DevArgs = {
  root: string,
  cwd: string,
  args: Array<string>,
  stdio?: Stdio,
};
type Dev = (DevArgs) => Promise<void>;
*/
const dev /*: Dev */ = async ({root, cwd, args, stdio = 'inherit'}) => {
  await run({root, cwd, args, name: 'dev', stdio});
};

/*::
export type LintArgs = {
  root: string,
  cwd: string,
  args: Array<string>,
  stdio?: Stdio,
};
type Lint = (LintArgs) => Promise<void>;
*/
const lint /*: Lint */ = async ({root, cwd, args, stdio = 'inherit'}) => {
  await run({root, cwd, args, name: 'lint', stdio});
};

/*::
export type FlowArgs = {
  root: string,
  cwd: string,
  args: Array<string>,
  stdio?: Stdio,
};
type Flow = (FlowArgs) => Promise<void>;
*/
const flow /*: Flow */ = async ({root, cwd, args, stdio = 'inherit'}) => {
  await run({root, cwd, args, name: 'flow', stdio});
};

/*::
export type TypecheckArgs = {
  root: string,
  cwd: string,
  args: Array<string>,
  stdio?: Stdio,
};
type Typecheck = (TypecheckArgs) => Promise<void>;
*/
const typecheck /*: Typecheck */ = async ({
  root,
  cwd,
  args,
  stdio = 'inherit',
}) => {
  await run({root, cwd, args, name: 'typecheck', stdio});
};

/*::
export type StartArgs = {
  root: string,
  cwd: string,
  args: Array<string>,
  stdio?: Stdio,
};
type Start = (StartArgs) => Promise<void>;
*/
const start /*: Start */ = async ({root, cwd, args, stdio = 'inherit'}) => {
  await run({root, cwd, args, stdio});
};

/*::
export type ExecArgs = {
  root: string,
  cwd: string,
  args: Array<string>,
  stdio?: Stdio,
}
export type Exec = (ExecArgs) => Promise<void>;
*/
const exec /*: Exec */ = async ({root, cwd, args, stdio = 'inherit'}) => {
  const [command, ...params] = args;
  const path = process.env.PATH || '';
  const bazelDir = dirname(bazel);
  const nodeDir = dirname(node);
  const env = {
    ...process.env,
    PATH: `${bazelDir}:${nodeDir}:${path}`,
  };
  await spawnOrExit(command, params, {cwd, env, stdio});
};

/*::
export type ScriptArgs = {
  root: string,
  cwd: string,
  command: string,
  args: Array<string>,
  stdio?: Stdio,
};
type Script = (ScriptArgs) => Promise<void>;
*/
const script /*: Script */ = async ({
  root,
  cwd,
  command,
  args,
  stdio = 'inherit',
}) => {
  await run({root, cwd, args: [command, ...args], name: 'script', stdio});
};

/*::
export type BazelQueryArgs = {
  cwd: string,
  query: string,
  args?: Array<string>
};
type BazelQuery = (BazelQueryArgs) => Promise<string>;
*/
const bazelQuery /*: BazelQuery */ = async ({cwd, query, args = []}) => {
  const queryFilePath = join(
    os.tmpdir(),
    `tmp-bazel-query-${randomBytes(6).toString('hex')}`
  );
  await fs.promises.writeFile(queryFilePath, query);

  try {
    const queryArgs = [`--query_file=${queryFilePath}`, ...args].join(' ');
    return await nodeExec(`${bazel} query ${queryArgs}`, {
      cwd,
      maxBuffer: 1e9,
    });
  } finally {
    fs.promises.unlink(queryFilePath);
  }
};

module.exports = {
  bazelQuery,
  build,
  test,
  lint,
  flow,
  typecheck,
  dev,
  start,
  run,
  exec,
  script,
};
