// @flow
/*::
import type {Metadata} from './get-local-dependencies.js';

export type GetUpstreams = ({dirs: Array<string>, target: string, data?: Array<Metadata>) => Array<Metadata>
*/

const {read} = require('../utils/node-helpers.js');

const getUpstreams /*: GetUpstreams */ = async ({dirs, target, data}) => {
  if (!data) {
    data = await Promise.all([
      ...dirs.map(async dir => {
        const meta = JSON.parse(await read(`${dir}/package.json`, 'utf8'));
        return {dir, meta, depth: 1};
      }),
    ]);
  }

  const targetData = data.find(d => d.dir === target);
  let upstreams = new Set();
  let queue = [targetData.meta.name];

  while (queue.length) {
    const nextDepName = queue.pop();
    if (upstreams.has(nextDepName)) {
      continue;
    }
    upstreams.add(nextDepName);
    for (const {meta} of data) {
      const fields = ['dependencies', 'devDependencies'];
      for (const field of fields) {
        const deps = meta[field] || {};
        if (deps[nextDepName]) {
          queue.push(meta.name);
        }
      }
    }
  }
  return Array.from(upstreams).map(name => {
    return data.find(({meta}) => meta.name === name);
  });
};

module.exports = {getUpstreams};
