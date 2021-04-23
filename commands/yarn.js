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
  await spawn(node, params, {cwd, stdio});
};

module.exports = {yarn: runYarn};
