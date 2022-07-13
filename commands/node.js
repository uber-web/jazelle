// @flow
const {existsSync} = require('fs');
const {spawn} = require('../utils/node-helpers.js');
const {node} = require('../utils/binary-paths.js');
const {getPassThroughArgs} = require('../utils/parse-argv.js');

/*::
import type {Stdio} from '../utils/node-helpers.js';

type NodeArgs = {
  root: string,
  cwd: string,
  args?: Array<string>,
  stdio?: Stdio,
}
type Node = (NodeArgs) => Promise<void>
*/
const runNode /*: Node */ = async ({
  root,
  cwd,
  args = [],
  stdio = 'inherit',
}) => {
  const pnpESMLoaderPath = `${root}/.pnp.loader.mjs`;
  const loaderArgs = existsSync(pnpESMLoaderPath)
    ? ['--loader', `'${pnpESMLoaderPath}'`]
    : [];
  const params = [
    '-r',
    `${root}/.pnp.cjs`,
    ...loaderArgs,
    ...getPassThroughArgs(args),
  ];
  await spawn(node, params, {env: {...process.env}, cwd, stdio});
};

module.exports = {node: runNode};
