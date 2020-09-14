// @flow
const {read} = require('./node-helpers.js');

/*::
export type GetManifestArgs = {
  root: string,
};
export type GetManifest = (GetManifestArgs) => Promise<Manifest>
export type Manifest = {
  registry?: string,
  projects: Array<string>,
  versionPolicy?: VersionPolicy,
  hooks?: Hooks,
  workspace: "host" | "sandbox",
}
export type ExceptionMetadata = {
  name: string,
  versions: Array<string>
};
export type VersionPolicy = {
  lockstep: boolean,
  exceptions: Array<string | ExceptionMetadata>,
}
export type Hooks = {
  preinstall?: string,
  postinstall?: string,
  postcommand?: string,
}
*/
const getManifest /*: GetManifest */ = async ({root}) => {
  const manifest = `${root}/manifest.json`;
  const data = await read(manifest, 'utf8').catch(() => null);
  const parsed = JSON.parse(data || '{}');

  if (!parsed.projects) {
    const topMeta = await read(`${root}/package.json`, 'utf8');
    parsed.projects = JSON.parse(topMeta).workspaces || [];
  }

  return {
    // defaults
    workspace: 'host',
    dependencySyncRule: 'web_library',
    ...parsed,
  };
};

module.exports = {getManifest};
