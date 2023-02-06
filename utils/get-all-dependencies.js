// @flow
const {read} = require('../utils/node-helpers.js');

/*::
import type {Metadata} from './get-local-dependencies.js';

export type GetAllDependenciesArgs = {
  root: string,
  projects: Array<string>,
};
export type GetAllDependencies = (GetAllDependenciesArgs) => Promise<Array<Metadata>>;
*/

const getAllDependencies /*: GetAllDependencies */ = async ({
  root,
  projects,
}) => {
  const roots = projects.map(dir => `${root}/${dir}`);
  const metadatas = await Promise.all(
    roots.map(async dir => ({
      depth: 0,
      dir,
      meta: await parseMetadata(dir),
    }))
  );
  // $FlowFixMe
  return metadatas.filter(m => m.meta != null);
};

const parseMetadata = async dir => {
  // allow JSON.parse to throw if the file does exist but is not formatted correctly
  // but ignore error if file is non-existent, as it may mean we're in a sparse checkout
  return read(`${dir}/package.json`, 'utf8').then(
    meta => JSON.parse(meta),
    e => null
  );
};

module.exports = {getAllDependencies};
