// @flow
const {bazel} = require('../utils/binary-paths.js');
const {spawnOrExit} = require('../utils/node-helpers.js');
const {getPassThroughArgs} = require('../utils/parse-argv.js');

/*::
import type {Stdio} from '../utils/node-helpers.js';

export type BazelArgs = {
  root: string,
  args: Array<string>,
  stdio?: Stdio,
}
export type Bazel = (BazelArgs) => Promise<void>
*/
const runBazel /*: Bazel */ = async ({root, args, stdio = 'inherit'}) => {
  const params = getPassThroughArgs(args);
  await spawnOrExit(bazel, [...params], {
    stdio,
    env: {...process.env},
    cwd: root,
  });
};

module.exports = {bazel: runBazel};
