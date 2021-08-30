// @flow
const {relative, basename, dirname} = require('path');
const {bazel, node} = require('./binary-paths.js');
const proc = require('child_process');
const {spawn} = require('./node-helpers.js');
const {
  chunksToLinesAsync,
  streamWrite,
} = require('../vendor/@rauschma/stringio');

const startupFlags = ['--host_jvm_args=-Xmx15g'];

const defaultRetryOptions = {
  numRetries: 5,
  backoff: 1000,
};

/*::
type RetryOptions = {
  numRetries: number,
  backoff: number
}
*/

const spawnBazelCommand = (
  args,
  {cwd, stdio},
  retryOptions = defaultRetryOptions
) => {
  if (typeof process.env.NODE_OPTIONS !== 'string') {
    process.env.NODE_OPTIONS = '--max_old_space_size=16384';
  } else if (!process.env.NODE_OPTIONS.includes('--max_old_space_size')) {
    // $FlowFixMe
    process.env.NODE_OPTIONS += ' --max_old_space_size=16384';
  }
  const errorWithSyncStackTrace = new Error();
  let shouldRetry = false;

  const child = proc.spawn(bazel, [...startupFlags, ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
    cwd,
  });

  async function handleOutput(readable, writable) {
    for await (const line of chunksToLinesAsync(readable)) {
      await streamWrite(writable, line);
      if (line.includes('BulkTransferException')) {
        shouldRetry = true;
      }
    }
  }

  let outStream = process.stdout;
  let errStream = process.stderr;

  if (Array.isArray(stdio)) {
    if (typeof stdio[1] === 'object') {
      outStream = stdio[1];
    }
    if (typeof stdio[2] === 'object') {
      errStream = stdio[2];
    }
  }

  handleOutput(child.stdout, outStream);
  handleOutput(child.stderr, errStream);

  return new Promise((resolve, reject) => {
    child.on('error', e => {
      reject(new Error(e));
    });
    child.on('close', code => {
      if (code > 0) {
        if (shouldRetry && retryOptions.numRetries > 0) {
          streamWrite(
            outStream,
            `BulkTransferException detected - retrying command with backoff ${retryOptions.backoff}ms`
          );
          setTimeout(() => {
            retryOptions.backoff = retryOptions.backoff * 2;
            retryOptions.numRetries = retryOptions.numRetries - 1;
            return spawnBazelCommand(args, {cwd, stdio}, retryOptions)
              .then(resolve)
              .catch(reject);
          }, retryOptions.backoff);
        } else {
          const commandString = 'bazel ' + args.join(' ');
          errorWithSyncStackTrace.message = `Process failed ${cwd}with exit code ${code}: ${commandString}`;
          // $FlowFixMe - maybe create specific error class to contain exit code?
          errorWithSyncStackTrace.status = code;
          reject(errorWithSyncStackTrace);
        }
      } else {
        resolve();
      }
    });
    process.on('exit', () => {
      // $FlowFixMe flow typedef is missing .exitCode
      if (child.exitCode === null) child.kill();
    });
  });
};

/*::
import type {Stdio} from './node-helpers.js';

export type BuildArgs = {
  root: string,
  cwd: string,
  name?: string,
  stdio?: Stdio,
  retryOptions?: RetryOptions,
};
export type Build = (BuildArgs) => Promise<void>;
*/

const build /*: Build */ = async ({
  root,
  cwd,
  name = basename(cwd),
  stdio = 'inherit',
  retryOptions = defaultRetryOptions,
}) => {
  cwd = relative(root, cwd);
  await spawnBazelCommand(
    ['build', `//${cwd}:${name}`, '--sandbox_debug'],
    {
      cwd: root,
      stdio,
    },
    retryOptions
  );
};

/*::
export type TestArgs = {
  root: string,
  cwd: string,
  args: Array<string>,
  name?: string,
  stdio?: Stdio,
  retryOptions?: RetryOptions,
};
type Test = (TestArgs) => Promise<void>;
*/
const test /*: Test */ = async ({
  root,
  cwd,
  args,
  name = 'test',
  stdio = 'inherit',
  retryOptions = defaultRetryOptions,
}) => {
  cwd = relative(root, cwd);
  const testParams = args.map(arg => `--test_arg=${arg}`);
  await spawnBazelCommand(
    ['run', `//${cwd}:${name}`, '--sandbox_debug', ...testParams],
    {cwd: root, stdio},
    retryOptions
  );
};

/*::
export type RunArgs = {
  root: string,
  cwd: string,
  args: Array<string>,
  name?: string,
  stdio?: Stdio,
  retryOptions?: RetryOptions,
};
type Run = (RunArgs) => Promise<void>;
*/
const run /*: Run */ = async ({
  root,
  cwd,
  args,
  name = basename(cwd),
  stdio = 'inherit',
  retryOptions = defaultRetryOptions,
}) => {
  cwd = relative(root, cwd);
  const runParams = args.length > 0 ? ['--', ...args] : [];
  await spawnBazelCommand(
    ['run', `//${cwd}:${name}`, '--sandbox_debug', ...runParams],
    {cwd: root, stdio},
    retryOptions
  );
};

/*::
export type DevArgs = {
  root: string,
  cwd: string,
  args: Array<string>,
  stdio?: Stdio,
  retryOptions?: RetryOptions,
};
type Dev = (DevArgs) => Promise<void>;
*/
const dev /*: Dev */ = async ({
  root,
  cwd,
  args,
  stdio = 'inherit',
  retryOptions = defaultRetryOptions,
}) => {
  await run({root, cwd, args, name: 'dev', stdio, retryOptions});
};

/*::
export type LintArgs = {
  root: string,
  cwd: string,
  args: Array<string>,
  stdio?: Stdio,
  retryOptions?: RetryOptions,
};
type Lint = (LintArgs) => Promise<void>;
*/
const lint /*: Lint */ = async ({
  root,
  cwd,
  args,
  stdio = 'inherit',
  retryOptions = defaultRetryOptions,
}) => {
  await run({root, cwd, args, name: 'lint', stdio, retryOptions});
};

/*::
export type FlowArgs = {
  root: string,
  cwd: string,
  args: Array<string>,
  stdio?: Stdio,
  retryOptions?: RetryOptions,
};
type Flow = (FlowArgs) => Promise<void>;
*/
const flow /*: Flow */ = async ({
  root,
  cwd,
  args,
  stdio = 'inherit',
  retryOptions = defaultRetryOptions,
}) => {
  await run({root, cwd, args, name: 'flow', stdio, retryOptions});
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
  await run({
    root,
    cwd,
    args,
    stdio,
    retryOptions: {numRetries: 0, backoff: 0},
  });
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
  await spawn(command, params, {cwd, env, stdio});
};

/*::
export type ScriptArgs = {
  root: string,
  cwd: string,
  command: string,
  args: Array<string>,
  stdio?: Stdio,
  retryOptions?: RetryOptions
};
type Script = (ScriptArgs) => Promise<void>;
*/
const script /*: Script */ = async ({
  root,
  cwd,
  command,
  args,
  stdio = 'inherit',
  retryOptions = defaultRetryOptions,
}) => {
  await run({
    root,
    cwd,
    args: [command, ...args],
    name: 'script',
    stdio,
    retryOptions,
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
