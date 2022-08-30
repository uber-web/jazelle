// @flow
const proc = require('child_process');
const {promisify} = require('util');
const {tmpdir} = require('os');
const {
  readFile,
  writeFile,
  access,
  readdir,
  mkdir: makeDir,
  lstat,
  realpath,
} = require('fs');
const {
  chunksToLinesAsync,
  streamWrite,
} = require('../vendor/@rauschma/stringio');

/*::
import {Writable, Readable, Duplex} from 'stream';
import type {ChildProcess} from 'child_process';

export type Exec = (string, ExecOptions, ?StdioOptions) => Promise<string>;
export type ExecOptions = void | {
  // https://nodejs.org/api/child_process.html#child_process_child_process_exec_command_options_callback
  cwd?: string,
  env?: typeof process.env,
  encoding?: string,
  shell?: string,
  timeout?: number,
  maxBuffer?: number,
  killSignal?: string | number,
  uid?: number,
  gid?: number,
  windowsHide?:boolean,
};
export type StdioOptions = Array<Writable>;
*/

const activeChildren /*: Set<ChildProcess> */ = new Set();

function sigintHandler() {
  // Ctrl+C normally sends signal to the whole process group,
  // so we just need to wait for the child processes to exit.
}

function sigtermHandler() {
  // SIGTERM is usually sent to a parent process, so it's the
  // parent process responsibility to propagate the signal to
  // the spawned child process.
  for (const child of activeChildren) {
    child.kill('SIGTERM');
  }
}

function exitHandler() {
  for (const child of activeChildren) {
    // $FlowFixMe flow typedef is missing .exitCode
    if (child.exitCode === null) {
      child.kill();
    }
  }
}

function addActiveChild(child) {
  activeChildren.add(child);

  if (activeChildren.size === 1) {
    process.on('SIGINT', sigintHandler);
    process.on('SIGTERM', sigtermHandler);
    process.on('exit', exitHandler);
  }
}

function removeActiveChild(child) {
  activeChildren.delete(child);

  if (activeChildren.size === 0) {
    process.off('SIGINT', sigintHandler);
    process.off('SIGTERM', sigtermHandler);
    process.off('exit', exitHandler);
  }
}

// use exec if you need stdout as a string, or if you need to explicitly setup shell in some way (e.g. export an env var)
const exec /*: Exec */ = (cmd, opts = {}, stdio = []) => {
  const errorWithSyncStackTrace = new Error(); // grab stack trace outside of promise so errors are easier to narrow down
  return new Promise((resolve, reject) => {
    const child = proc.exec(cmd, opts, (err, stdout, stderr) => {
      removeActiveChild(child);

      if (err) {
        // $FlowFixMe
        errorWithSyncStackTrace.status = err.code;
        errorWithSyncStackTrace.message = err.message;
        reject(errorWithSyncStackTrace);
      } else {
        resolve(String(stdout));
      }
    });
    addActiveChild(child);

    if (stdio) {
      if (stdio[0]) child.stdout.pipe(stdio[0]);
      if (stdio[1]) child.stderr.pipe(stdio[1]);
    }
  });
};
/*::
export type Spawn = (string, Array<string>, SpawnOptions) => Promise<void>;
export type SpawnOptions = void | {
  // https://nodejs.org/api/child_process.html#child_process_child_process_spawn_command_args_options
  cwd?: string,
  env?: {[string]: ?string},
  argv0?: string,
  stdio?: Stdio,
  detached?: boolean,
  uid?: number,
  gid?: number,
  shell?: boolean | string,
  windowsVerbatimArguments?: boolean,
  windowsHide?: boolean,
  // non-node options
  filterOutput?: (line: string, type: 'stdout' | 'stderr') => boolean,
};
export type Stdio = string | Array<string | number | null | Writable | Readable | Duplex>;
*/
// use spawn if you just need to run a command for its side effects, or if you want to pipe output straight back to the parent shell
const spawn /*: Spawn */ = (cmd, argv, opts = {}) => {
  if (typeof process.env.NODE_OPTIONS !== 'string') {
    process.env.NODE_OPTIONS = '--max_old_space_size=16384';
  } else if (!process.env.NODE_OPTIONS.includes('--max_old_space_size')) {
    // $FlowFixMe
    process.env.NODE_OPTIONS += ' --max_old_space_size=16384';
  }
  const errorWithSyncStackTrace = new Error();

  // filter approach ref: https://2ality.com/2018/05/child-process-streams.html#piping-between-child-processes
  async function filter(readable, writable, type) {
    for await (const line of chunksToLinesAsync(readable)) {
      // $FlowFixMe
      if (opts.filterOutput(line, type)) {
        await streamWrite(writable, line);
      }
    }
  }

  return new Promise((resolve, reject) => {
    if (opts && typeof opts.filterOutput === 'function') {
      opts.stdio = ['ignore', 'pipe', 'pipe'];
    }

    if (opts.env == null) {
      opts.env = {...process.env};
    } else {
      opts.env.NODE_OPTIONS = process.env.NODE_OPTIONS;
    }

    const child = proc.spawn(cmd, argv, opts);
    addActiveChild(child);

    if (opts && typeof opts.filterOutput === 'function') {
      filter(child.stdout, process.stdout, 'stdout');
      filter(child.stderr, process.stderr, 'stderr');
    }

    child.on('error', e => {
      removeActiveChild(child);

      reject(new Error(e));
    });
    child.on('close', code => {
      removeActiveChild(child);

      if (code > 0) {
        const args = argv.join(' ');
        const cwd = opts && opts.cwd ? `at ${opts.cwd} ` : '';
        errorWithSyncStackTrace.message = `Process failed ${cwd}with exit code ${code}: ${cmd} ${args}`;
        // $FlowFixMe - maybe create specific error class to contain exit code?
        errorWithSyncStackTrace.status = code;
        reject(errorWithSyncStackTrace);
      } else {
        resolve();
      }
    });

    if (opts.detached) child.unref();
  });
};
const spawnOrExit /*: Spawn */ = async (...args) => {
  try {
    return await spawn(...args);
  } catch (e) {
    process.exit(e.status || 1);
  }
};

const accessFile = promisify(access);

/*::
export type Exists = (string) => Promise<boolean>;
*/
const exists /*: Exists */ = filename =>
  accessFile(filename)
    .then(() => true)
    .catch(() => false);

const read = promisify(readFile);
const write = promisify(writeFile);
const ls = promisify(readdir);
const mkdir = promisify(makeDir);
const lstatP = promisify(lstat);
const realpathP = promisify(realpath);

/*::
export type Move = (string, string) => Promise<void>
*/
const move /*: Move */ = async (from, to) => {
  await spawn('mv', [from, to]); // fs.rename can't move across devices/partitions so it can die w/ EXDEV error
};

/*::
export type Remove = (string) => Promise<void>;
*/
const remove /*: Remove */ = async dir => {
  const tmp = `${tmpdir()}/${Math.random() * 1e17}`;
  // $FlowFixMe flow can't handle statics of async function
  const fork = remove.fork;
  if (await exists(dir)) {
    await exec(`mkdir -p ${tmp} && mv ${dir} ${tmp}`);
    const child = proc.spawn('rm', ['-rf', tmp], {
      detached: fork,
      stdio: 'ignore',
    });
    if (fork) child.unref();
  }
};
// $FlowFixMe flow can't handle statics of async function
remove.fork = true;

module.exports = {
  exec,
  spawn,
  spawnOrExit,
  exists,
  read,
  write,
  remove,
  ls,
  mkdir,
  move,
  lstat: lstatP,
  realpath: realpathP,
};
