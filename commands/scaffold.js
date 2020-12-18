// @flow
const {resolve, relative, basename, join} = require('path');
const {getManifest} = require('../utils/get-manifest.js');
const {spawn, exists, read, write} = require('../utils/node-helpers.js');
const {executeHook} = require('../utils/execute-hook.js');
const {align} = require('./align.js');
const {sortPackageJson} = require('../utils/sort-package-json');

/*::
type ScaffoldArgs = {
  root: string,
  cwd: string,
  from: string,
  to: string,
  name?: string,
  skipPreinstall?: boolean,
  skipPostinstall?: boolean,
};
type Scaffold = (ScaffoldArgs) => Promise<void>
*/
const scaffold /*: Scaffold */ = async ({
  root,
  cwd,
  from,
  to,
  name,
  skipPreinstall = false,
  skipPostinstall = false,
}) => {
  const manifest = /*:: await */ await getManifest({root});
  const pkgPath = join(root, 'package.json');
  const pkg = JSON.parse(await read(pkgPath));
  const {hooks} = manifest;

  const absoluteFrom = resolve(cwd, from);
  const absoluteTo = resolve(cwd, to);
  const relativeFrom = relative(root, absoluteFrom);
  const relativeTo = relative(root, absoluteTo);

  await spawn('mkdir', ['-p', absoluteTo]);
  await spawn('cp', ['-r', absoluteFrom + '/.', absoluteTo]);

  if (hooks && skipPreinstall === false)
    await executeHook(hooks.prescaffold, absoluteTo);

  const metaFile = `${absoluteTo}/package.json`;
  const meta = JSON.parse(await read(metaFile, 'utf8'));
  meta.name = name || basename(relativeTo);
  await write(metaFile, sortPackageJson(meta), 'utf8');

  const buildFile = `${absoluteTo}/BUILD.bazel`;
  if (await exists(buildFile)) {
    const build = await read(buildFile, 'utf8');
    const targetPath = new RegExp(relativeFrom, 'g');
    const replaced = build.replace(targetPath, relativeTo);
    await write(buildFile, replaced, 'utf8');
  }

  const workspaces = [...new Set([...pkg.workspaces, relativeTo])].sort();
  pkg.workspaces = workspaces;
  await write(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  await align({root, cwd: absoluteTo, skipPreinstall, skipPostinstall});

  if (hooks && skipPostinstall === false)
    await executeHook(hooks.postscaffold, absoluteTo);
};

module.exports = {scaffold};
