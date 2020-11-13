// @flow
const {getPassThroughArgs} = require('../utils/parse-argv.js');
const {spawnFiltered} = require('../utils/spawn-filtered.js');
const {node, yarn} = require('../utils/binary-paths.js');

/*::
import type {Stdio} from '../utils/node-helpers.js';

type YarnArgs = {
  cwd: string,
  args?: Array<string>,
  stdio?: Stdio,
  verbose?: boolean,
}
type Yarn = (YarnArgs) => Promise<void>
*/
const runYarn /*: Yarn */ = async ({
  cwd,
  args = [],
  stdio,
  verbose = false,
}) => {
  const params = [yarn, ...getPassThroughArgs(args)];
  await spawnFiltered(node, params, {
    spawnOpts: {env: process.env, cwd, stdio},
    verbose,
  });
};

module.exports = {yarn: runYarn};
