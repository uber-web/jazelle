// @flow
const {assertProjectDir} = require('../utils/assert-project-dir.js');
const {getManifest} = require('../utils/get-manifest.js');
const {executeProjectCommand} = require('../utils/execute-project-command.js');

/*::
import type {Stdio} from '../utils/node-helpers.js';
export type BuildArgs = {
  root: string,
  cwd: string,
  stdio?: Stdio,
}
export type Build = (BuildArgs) => Promise<void>
*/
const build /*: Build */ = async ({root, cwd, stdio = 'inherit'}) => {
  await assertProjectDir({dir: cwd});

  const {hasSandboxIO} = await getManifest({root});

  if (hasSandboxIO) {
    // don't throw error on jz build if build configuration is known to write to sandbox
    await executeProjectCommand({
      root,
      cwd,
      command: 'script',
      args: ['build'],
      stdio,
    });
  } else {
    await executeProjectCommand({root, cwd, command: 'build', stdio});
  }
};

module.exports = {build};
