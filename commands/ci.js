// @flow
const {install} = require('./install.js');

/*::
export type CiArgs = {
  root: string,
  cwd: string,
  verbose?: boolean,
}
export type Ci = (CiArgs) => Promise<void>
*/
const ci /*: Ci */ = async ({root, cwd, verbose = false}) => {
  await install({root, cwd, frozenLockfile: true, conservative: true, verbose});
};

module.exports = {ci};
