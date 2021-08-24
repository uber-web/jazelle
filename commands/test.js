// @flow
const {assertProjectDir} = require('../utils/assert-project-dir.js');
const {getPassThroughArgs} = require('../utils/parse-argv.js');
const {executeProjectCommand} = require('../utils/execute-project-command.js');

/*::
import type {Stdio} from '../utils/node-helpers.js';
export type TestArgs = {
  root: string,
  cwd: string,
  args: Array<string>,
  stdio?: Stdio,
}
export type Test = (TestArgs) => Promise<void>
*/
const test /*: Test */ = async ({root, cwd, args, stdio = 'inherit'}) => {
  await assertProjectDir({dir: cwd});

  const params = getPassThroughArgs(args);
  if (params.includes('--watch')) {
    throw new Error(
      'Watch flag not supported with jazelle test. Try using jazelle yarn test --watch instead'
    );
  }
  await executeProjectCommand({
    root,
    cwd,
    command: 'test',
    args: params,
    stdio,
  });
};

module.exports = {test};
