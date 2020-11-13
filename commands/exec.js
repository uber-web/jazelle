// @flow
const {assertProjectDir} = require('../utils/assert-project-dir.js');
const {getPassThroughArgs} = require('../utils/parse-argv.js');
const {executeProjectCommand} = require('../utils/execute-project-command.js');

/*::
import type {Stdio} from '../utils/node-helpers.js';
export type ExecArgs = {
  root: string,
  cwd: string,
  args: Array<string>,
  stdio?: Stdio,
  verbose?: boolean,
}
export type Exec = (ExecArgs) => Promise<void>
*/
const exec /*: Exec */ = async ({root, cwd, args, stdio, verbose = false}) => {
  await assertProjectDir({dir: cwd});

  const params = getPassThroughArgs(args);
  await executeProjectCommand({
    root,
    cwd,
    command: 'exec',
    args: params,
    verbose,
  });
};

module.exports = {exec};
