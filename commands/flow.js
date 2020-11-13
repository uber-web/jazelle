// @flow
const {assertProjectDir} = require('../utils/assert-project-dir.js');
const {getPassThroughArgs} = require('../utils/parse-argv.js');
const {executeProjectCommand} = require('../utils/execute-project-command.js');

/*::
import type {Stdio} from '../utils/node-helpers.js';
export type FlowArgs = {
  root: string,
  cwd: string,
  args: Array<string>,
  stdio?: Stdio,
  verbose?: boolean,
}
export type Flow = (FlowArgs) => Promise<void>
*/
const flow /*: Flow */ = async ({root, cwd, args, stdio, verbose = false}) => {
  await assertProjectDir({dir: cwd});

  const params = getPassThroughArgs(args);
  await executeProjectCommand({
    root,
    cwd,
    command: 'flow',
    args: params,
    stdio,
    verbose,
  });
};

module.exports = {flow};
