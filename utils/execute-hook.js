// @flow
const {dirname} = require('path');
const {node} = require('./binary-paths.js');
const {exec} = require('./node-helpers.js');

function clearPrevLine() {
  // $FlowFixMe
  process.stdout.moveCursor(0, -1);
  // $FlowFixMe
  process.stdout.clearLine(1);
}

/*::
type Opts = {
  env?: {},
  isBooleanHook?: boolean,
};
type ExecuteHook = (?string, string, ?Opts) => Promise<boolean|void>;
*/
const executeHook /*: ExecuteHook */ = async (hook, root, opts = {}) => {
  opts = {
    env: {},
    isBooleanHook: false,
    ...opts,
  };

  const nodePath = dirname(node);
  if (typeof hook === 'string') {
    // prioritize hermetic Node version over system version
    const execOpts = {
      env: {
        ...process.env,
        PATH: `${nodePath}:${String(process.env.PATH)}`,
        ...opts.env,
      },
      cwd: root,
    };

    const output = await exec(hook, execOpts, [process.stdout, process.stderr]);

    if (opts.isBooleanHook) {
      const lines = output.split('\n').filter(Boolean);
      const lastLine = lines[lines.length - 1];

      if (lastLine === 'true') {
        clearPrevLine();
        return true;
      } else if (lastLine === 'false') {
        clearPrevLine();
        return false;
      }
    }
  }
};

module.exports = {executeHook};
