// @flow
const {spawn} = require('../utils/node-helpers.js');
const {node, yarn} = require('../utils/binary-paths.js');
const {getPassThroughArgs} = require('../utils/parse-argv.js');

/*::
import type {Stdio} from '../utils/node-helpers.js';

type YarnArgs = {
  cwd: string,
  args?: Array<string>,
  stdio?: Stdio,
}
type Yarn = (YarnArgs) => Promise<void>
*/
const runYarn /*: Yarn */ = async ({cwd, args = [], stdio = 'inherit'}) => {
  const params = [yarn, ...getPassThroughArgs(args)];
  if (typeof process.env.NODE_OPTIONS !== 'string') {
    process.env.NODE_OPTIONS = '--max_old_space_size=8192';
  } else if (!process.env.NODE_OPTIONS.includes('--max_old_space_size')) {
    // $FlowFixMe
    process.env.NODE_OPTIONS += ' --max_old_space_size=8192';
  }
  await spawn(node, params, {env: process.env, cwd, stdio});
};

module.exports = {yarn: runYarn};
