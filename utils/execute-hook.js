// @flow
const {dirname} = require('path');
const {node} = require('./binary-paths.js');
const {exec} = require('./node-helpers.js');

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

    if (opts.isBooleanHook) {
      const output = await exec(hook, execOpts);
      const lines = output.split('\n').filter(Boolean);
      const lastLine = lines[lines.length - 1];

      if (lastLine === 'true') {
        return true;
      } else if (lastLine === 'false') {
        return false;
      }
    } else {
      const stdio = [process.stdout, process.stderr];
      await exec(hook, execOpts, stdio);
    }
  }
};

module.exports = {executeHook};
