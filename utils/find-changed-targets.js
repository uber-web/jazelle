// @flow
const {bazelQuery} = require('./bazel-commands.js');
const {getManifest} = require('./get-manifest.js');
const {getDownstreams} = require('../utils/get-downstreams.js');
const {exists, read} = require('../utils/node-helpers.js');

/*::
export type FindChangedTargetsArgs = {
  root: string,
  files?: string,
  format?: string,
};
export type FindChangedTargets = (FindChangedTargetsArgs) => Promise<Array<string>>;
*/
const findChangedTargets /*: FindChangedTargets */ = async ({
  root,
  files,
  format = 'targets',
}) => {
  let {targets} = await findChangedBazelTargets({root, files});

  if (format === 'dirs') {
    targets = [
      ...targets.reduce((set, target) => {
        // convert from target to dir path
        set.add(target.slice(2, target.indexOf(':')));
        return set;
      }, new Set()),
    ];
  }

  return targets;
};

const scan = async (root, lines) => {
  const result = await Promise.all(
    lines.map(async file => [file, await exists(`${root}/${file}`)])
  );
  return [
    result.filter(r => !r[1]).map(r => r[0]),
    result.filter(r => r[1]).map(r => r[0]),
  ];
};

function quoteFilePaths(paths) {
  return paths.map(path => `"${path}"`);
}

const findChangedBazelTargets = async ({root, files}) => {
  const bazelignore = await read(`${root}/.bazelignore`, 'utf8').catch(
    () => ''
  );
  const ignored = bazelignore
    .split('\n')
    .filter(Boolean)
    .filter(line => !line.endsWith('node_modules'))
    .map(line => line.trim());

  // if no file, fallback to reading from stdin (fd=0)
  const data = await read(files || 0, 'utf8').catch(() => '');
  const lines = data
    .split('\n')
    .filter(Boolean)
    .map(line => line.trim())
    .filter(line => !ignored.find(i => line.startsWith(i)));

  const invalid = lines.find(line => line.includes('"'));
  if (invalid) {
    // Disallow double quote (") character in file paths, because Bazel query syntax
    // utilizes double quotes to encapsulate strings. Including a double quote within
    // a file path could lead to syntax errors in the Bazel query.
    // Note: In the future, we may relax this constraint if support is required. This could
    // be achieved by running multiple queries, where file paths containing special characters
    // like single or double quotes could be queried separately. File paths with single quotes
    // could be encapsulated using double quotes, and vice versa, to ensure query integrity.
    throw new Error(`File path cannot contain double quotes: '${invalid}'`);
  }

  const {projects, workspace} = await getManifest({root});
  if (workspace === 'sandbox') {
    if (lines.includes('WORKSPACE') || lines.includes('.bazelversion')) {
      const result = await bazelQuery({
        cwd: root,
        query: 'kind("(web_.*|.*_test) rule", "...")',
      });
      const unfiltered = result.split('\n').filter(Boolean);
      const targets = unfiltered.filter(target => {
        const path = target.replace(/\/\/(.+?):.+/, '$1');
        return projects.includes(path);
      });
      return {workspace, targets};
    } else {
      /*
        Separate files into two categories: files that exist and files that have been deleted
        For files that have been deleted, try to recover some other file in the package
      */
      const [missing, exists] = await scan(root, lines);
      const recoveredMissing = missing.length
        ? await bazelQuery({
            cwd: root,
            query: quoteFilePaths(missing).join(' + '),
            args: ['--keep_going'],
          })
            .then(() => {
              // This should never hit because we're checking for missing files,
              // but if it does, we still want to hit the catch block below
              throw new Error('');
            })
            .catch(e => {
              // if file doesn't exist, find which package it would've belong to, and take source files in the same package
              // doing so is sufficient, because we just want to find out which targets have changed
              // - in the case the file was deleted but a package still exists, pkg will refer to the package
              // - in the case the package itself was deleted, pkg will refer to the root package (which will typically yield no targets in a typical Jazelle setup)
              const regex = /not declared in package '(.*?)'/g;
              return Array.from(e.message.matchAll(regex))
                .map(([, pkg]) =>
                  pkg ? `kind("source file", "//${pkg}:*")` : ''
                )
                .filter(Boolean);
            })
        : [];
      const innerQuery = Array.from(
        new Set([...quoteFilePaths(exists), ...recoveredMissing])
      ).join(' + ');
      const unfiltered = innerQuery.length
        ? (
            await bazelQuery({
              cwd: root,
              query: `let graph = kind("(web_.*|.*_test|filegroup) rule", rdeps("...", ${innerQuery})) in $graph except filter("node_modules", $graph)`,
              args: ['--output=label'],
            })
          )
            .split('\n')
            .filter(Boolean)
        : [];

      const targets = unfiltered.filter(target => {
        const path = target.replace(/\/\/(.+?):.+/, '$1');
        return projects.includes(path);
      });
      return {workspace, targets};
    }
  } else {
    const allProjects = await Promise.all([
      ...projects.map(async dir => {
        const meta = JSON.parse(
          await read(`${root}/${dir}/package.json`, 'utf8')
        );
        return {dir, meta, depth: 1};
      }),
    ]);

    if (lines.includes('WORKSPACE')) {
      const targets = [];
      for (const project of projects) {
        targets.push(
          `//${project}:test`,
          `//${project}:lint`,
          `//${project}:flow`
        );
      }
      return {workspace, targets};
    } else {
      const set = new Set();
      if (lines.length > 0) {
        for (const project of projects) {
          for (const line of lines) {
            if (line.startsWith(project)) set.add(project);
          }
        }
      }

      // Add to the changeSet all downstream packages that have a dependency
      const changeSet = new Set(set);
      for (const target of set) {
        const dep = allProjects.find(project => project.dir === target);
        if (dep) {
          const downstreamDeps = getDownstreams({deps: allProjects, dep});
          for (const downstreamDep of downstreamDeps) {
            changeSet.add(downstreamDep.dir);
          }
        }
      }

      const targets = [];
      for (const project of changeSet) {
        targets.push(
          `//${project}:test`,
          `//${project}:lint`,
          `//${project}:flow`
        );
      }
      return {workspace, targets};
    }
  }
};

module.exports = {findChangedTargets};
