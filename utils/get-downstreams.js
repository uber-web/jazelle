// @flow
/*::
import type {Metadata} from './get-local-dependencies.js';

export type GetDownstreams = (Array<Metadata>, Metadata) => Array<Metadata>
*/
const getDownstreams /*: GetDownstreams */ = (
  deps,
  dep,
  excludeWorkspaceDeps = false
) => {
  return getDedupedDownstreams(deps, dep, excludeWorkspaceDeps).slice(1);
};
const getDedupedDownstreams = (
  deps,
  dep,
  excludeWorkspaceDeps,
  set = new Set()
) => {
  const downstreams = [dep];
  if (!set.has(dep.dir)) {
    set.add(dep.dir);
    for (const item of deps) {
      const names = {
        ...item.meta.dependencies,
        ...item.meta.devDependencies,
      };
      if (
        dep.meta.name in names &&
        (names[dep.meta.name] !== 'workspace:*' || !excludeWorkspaceDeps) &&
        !set.has(item.dir)
      ) {
        downstreams.push(
          ...getDedupedDownstreams(deps, item, excludeWorkspaceDeps, set)
        );
      }
    }
  }
  return downstreams;
};

module.exports = {getDownstreams};
