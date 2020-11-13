// @flow
const {assertProjectDir} = require('../utils/assert-project-dir.js');
const {executeProjectCommand} = require('../utils/execute-project-command.js');

/*::
import type {Stdio} from '../utils/node-helpers.js';
export type BuildArgs = {
  root: string,
  cwd: string,
  stdio?: Stdio,
  verbose?: boolean,
}
export type Build = (BuildArgs) => Promise<void>
*/
const build /*: Build */ = async ({root, cwd, stdio, verbose = false}) => {
  await assertProjectDir({dir: cwd});

  await executeProjectCommand({root, cwd, command: 'build', stdio, verbose});
};

module.exports = {build};
