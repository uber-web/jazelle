// @flow
const {getManifest} = require('../utils/get-manifest.js');
const {spawn, remove} = require('../utils/node-helpers.js');
const {bazel} = require('../utils/binary-paths.js');

/*::
export type PurgeArgs = {
  root: string,
};
export type Purge = (PurgeArgs) => Promise<void>;
*/
const purge /*: Purge */ = async ({root}) => {
  const {projects = []} = await getManifest({root});
  await Promise.all([
    ...projects.map(project => remove(`${root}/${project}/node_modules`)),
    remove(`${root}/third_party/jazelle/temp`),
    remove(`${root}/.yarn/cache`),
    remove(`${root}/.yarn/unplugged`),
    remove(`${root}/.yarn/build-state.yml`),
    remove(`${root}/.yarn/install-state.gz`),
    spawn(bazel, ['clean', '--expunge'], {
      cwd: root,
      stdio: 'inherit',
    }).catch(() => {}), // user doesn't care for our stack trace, just pipe bazel output instead
  ]);
};

module.exports = {purge};
