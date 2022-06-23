// @flow
const {minVersion, satisfies, valid} = require('../utils/cached-semver');
const {getManifest} = require('../utils/get-manifest.js');
const {findLocalDependency} = require('../utils/find-local-dependency.js');
const {read, write} = require('../utils/node-helpers.js');
const {spawn} = require('../utils/node-helpers.js');
const {node, yarn} = require('../utils/binary-paths.js');
const {install} = require('./install.js');

/*::
export type UpgradeArgs = {
  root: string,
  args: Array<string>,
};
export type Upgrade = (UpgradeArgs) => Promise<void>;
*/
const upgrade /*: Upgrade */ = async ({root, args}) => {
  const {projects} = await getManifest({root});
  const roots = projects.map(dir => `${root}/${dir}`);

  // group by whether the dep is local (listed in manifest.json) or external (from registry)
  const locals = [];
  const externals = [];
  for (const arg of args) {
    let [, name, version] = arg.match(/(@?[^@]*)@?(.*)/) || [];
    const local = await findLocalDependency({root, name});
    if (local) locals.push({local, name, version});
    else externals.push({name, range: version});
  }

  if (locals.length > 0) {
    await Promise.all(
      roots.map(async cwd => {
        const meta = JSON.parse(await read(`${cwd}/package.json`, 'utf8'));

        for (const {local, name, version} of locals) {
          if (version && version !== local.meta.version) {
            const error = `You must use version ${name}@${local.meta.version}`;
            throw new Error(error);
          }

          // don't update peerDependencies, we don't want to inadvertedly cause downstreams to have multiple versions of things
          update(meta, 'dependencies', name, local.meta.version);
          update(meta, 'devDependencies', name, local.meta.version);
          update(meta, 'optionalDependencies', name, local.meta.version);
        }
        await write(
          `${cwd}/package.json`,
          JSON.stringify(meta, null, 2) + '\n',
          'utf8'
        );
      })
    );
  }
  if (externals.length > 0) {
    const deps = externals.map(({name, range}) => {
      return name + (range ? `@${range}` : '');
    });
    await spawn(node, [yarn, 'up', '-C', ...deps], {
      cwd: root,
      stdio: 'inherit',
    });
    await install({root, cwd: root, frozenLockfile: true, conservative: true});
  }
};

const update = (meta, type, name, version, from) => {
  if (meta[type] && meta[type][name]) {
    const curr = meta[type][name];
    const inRange = !valid(curr) || !from || satisfies(minVersion(curr), from);
    if (inRange && !meta[type][name].includes('*')) meta[type][name] = version;
  }
};

module.exports = {upgrade};
