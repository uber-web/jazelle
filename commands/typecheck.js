// @flow

const {assertProjectDir} = require('../utils/assert-project-dir.js');
const {getPassThroughArgs} = require('../utils/parse-argv.js');
const {executeProjectCommand} = require('../utils/execute-project-command.js');

/*::
import type {Stdio} from '../utils/node-helpers.js';
export type TypecheckArgs = {
  root: string,
  cwd: string,
  args: Array<string>,
  stdio?: Stdio,
}
export type Typecheck = (TypecheckArgs) => Promise<void>
*/
const typecheck /*: Typecheck */ = async ({root, cwd, args, stdio = 'inherit'}) => {
  console.log("ARGS", args);
  await assertProjectDir({dir: cwd});

  const params = getPassThroughArgs(args);
  await executeProjectCommand({
    root,
    cwd,
    command: 'typecheck',
    args: params,
    stdio,
  });
};

module.exports = {typecheck};
