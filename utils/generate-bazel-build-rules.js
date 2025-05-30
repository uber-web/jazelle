// @flow
const {relative, basename} = require('path');
const {exists, read, write} = require('./node-helpers.js');
const {
  getCallArgItems,
  addCallArgItem,
  removeCallArgItem,
  sortCallArgItems,
} = require('./starlark.js');
const semver = require('../utils/cached-semver');

/*::
import type {Metadata} from './get-local-dependencies.js';

export type GenerateBazelBuildRulesArgs = {
  root: string,
  deps: Array<Metadata>,
  projects: Array<string>,
  dependencySyncRule: string,
  immutable: boolean,
}
// returns list of changed files
export type GenerateBazelBuildRules = (GenerateBazelBuildRulesArgs) => Promise<Array<string>>
export type TemplateArgs = {
  name: string,
  path: string,
  label: string,
  dependencies: Array<string>,
}
export type Template = (TemplateArgs) => Promise<string>;
*/
const generateBazelBuildRules /*: GenerateBazelBuildRules */ = async ({
  root,
  deps,
  projects,
  dependencySyncRule,
  immutable,
}) => {
  const depMap = deps.reduce((map, dep) => {
    map[dep.meta.name] = dep;
    return map;
  }, {});

  const changedFiles /*: Array<string> */ = [];
  await Promise.all(
    deps.map(async dep => {
      const buildFilePath = `${dep.dir}/BUILD.bazel`;
      const buildFileExists = await exists(buildFilePath);

      if (!buildFileExists) {
        changedFiles.push(relative(root, buildFilePath));

        if (immutable) {
          // don't need to do any more work since we know it will change
          return;
        }
      }

      const dependencies = [
        ...new Set([
          ...getDepLabels(root, depMap, dep.meta.dependencies),
          ...getDepLabels(root, depMap, dep.meta.devDependencies),
        ]),
      ].sort();
      if (!buildFileExists) {
        // generate BUILD.bazel file
        const path = relative(root, dep.dir);
        const name = basename(path);
        // $FlowFixMe
        const template /*: Template */ = (await require(`${root}/third_party/jazelle/scripts/build-file-template.js`)).template; // eslint-disable-line
        const rules = await template({
          name,
          path,
          label: `//${path}:${name}`,
          dependencies,
        });
        await write(buildFilePath, rules.trim(), 'utf8');
      } else {
        // sync web_library deps list in BUILD.bazel with local dependencies in package.json
        const src = await read(buildFilePath, 'utf8');
        let code = src;
        const items = getCallArgItems(code, dependencySyncRule, 'deps');
        dependencies
          .map(d => `"${d}"`)
          .forEach(dependency => {
            // only add if no related target exists
            const [path] = dependency.split(':');
            const paths = items.map(item => item.split(':').shift());
            if (!paths.includes(path)) {
              code = addCallArgItem(
                code,
                dependencySyncRule,
                'deps',
                `${dependency}`
              );
            }
          });
        items.forEach(item => {
          if (!dependencies.map(d => `"${d}"`).includes(item)) {
            const [, path, name] = item.match(/\/\/(.+?):([^"]+)/) || [];
            // force include target allows for projects to be included as bazel deps even if they are not in package.json deps
            // it is an edge case that should be avoided if at all possible
            if (projects.includes(path) && name !== 'force-include') {
              code = removeCallArgItem(code, dependencySyncRule, 'deps', item);
            }
          }
        });
        const sorted = sortCallArgItems(code, dependencySyncRule, 'deps');
        if (src.trim() !== sorted.trim()) {
          changedFiles.push(relative(root, buildFilePath));

          if (!immutable) {
            await write(buildFilePath, sorted, 'utf8');
          }
        }
      }
    })
  );

  return changedFiles;
};

const getDepLabels = (root, depMap, dependencies = {}) => {
  return Object.keys(dependencies)
    .map(name => {
      const {dir, meta} = depMap[name] || {};
      const version = dependencies[name];
      if (
        dir != null &&
        (version.includes('*') || semver.satisfies(meta.version, version))
      ) {
        // use :library target unless a build script is specified
        const path = relative(root, dir);
        const target =
          meta.scripts && meta.scripts.build ? basename(path) : 'library';
        return `//${path}:${target}`;
      } else {
        return null;
      }
    })
    .filter(Boolean);
};

module.exports = {generateBazelBuildRules};
