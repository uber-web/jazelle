// @flow
const {assertProjectDir} = require('../utils/assert-project-dir.js');
const {getPassThroughArgs} = require('../utils/parse-argv.js');
const {executeProjectCommand} = require('../utils/execute-project-command.js');

/*::
import type {Stdio} from '../utils/node-helpers.js';
type ScriptArgs = {
  root: string,
  cwd: string,
  args: Array<string>,
  stdio?: Stdio,
  verbose?: boolean,
};
type Script = (ScriptArgs) => Promise<void>;
*/
const script /*: Script */ = async ({
  root,
  cwd,
  args,
  stdio,
  verbose = false,
}) => {
  await assertProjectDir({dir: cwd});

  const params = getPassThroughArgs(args);
  await executeProjectCommand({
    root,
    cwd,
    command: 'script',
    args: params,
    stdio,
    verbose,
  });
};

module.exports = {script};
