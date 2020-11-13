// @flow
const {assertProjectDir} = require('../utils/assert-project-dir.js');
const {getPassThroughArgs} = require('../utils/parse-argv.js');
const {executeProjectCommand} = require('../utils/execute-project-command.js');

/*::
import type {Stdio} from '../utils/node-helpers.js';
export type StartArgs = {
  root: string,
  cwd: string,
  args: Array<string>,
  stdio?: Stdio,
  verbose?: boolean,
}
export type Start = (StartArgs) => Promise<void>
*/
const start /*: Start */ = async ({
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
    command: 'start',
    args: params,
    stdio,
    verbose,
  });
};

module.exports = {start};
