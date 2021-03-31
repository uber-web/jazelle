// @flow
const {resolve, dirname} = require('path');
const {existsSync} = require('fs');

/*::
export type GetRootDirArgs = {
  dir: string
}
export type GetRootDir = (GetRootDirArgs) => string
*/
const getRootDir /*: GetRootDir */ = ({dir}) => {
  dir = resolve(dir);
  if (existsSync(`${dir}/manifest.json`)) {
    return dir;
  } else if (dir !== '/') {
    return getRootDir({dir: dirname(dir)});
  } else {
    throw new Error(
      'No root directory could be found. Make sure you have created a manifest.json file'
    );
  }
};

module.exports.getRootDir = getRootDir;
