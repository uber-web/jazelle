// @flow
const {maxSatisfying, rsort} = require('../vendor/semver/semver.js');
const {exec} = require('./node-helpers.js');

/*::
type ExternalDep = {name: string, range?: string};
type CheckBundledTypes = (
  string,
  ?string,
  string
) => Promise<any>;
type FindBestTypesVersion = (
  string,
  ?string,
  string,
  (string, ?string, Array<string>, boolean) => Promise<?string>
) => Promise<?string>;
type GetTypesPackages = (
  Array<ExternalDep>,
  string,
  Array<string>,
  (string, ?string, Array<string>, boolean) => Promise<?string>
) => Promise<Array<string>>;
type RemoveTypesPackage = (string, Array<string>) => Promise<void>;
*/

const MAX_BUFFER_SIZE = 5 * 1024 * 1024;

const checkBundledTypes /*: CheckBundledTypes */ = async (
  packageName,
  versionRange,
  root
) => {
  try {
    const versionSpec = versionRange || 'latest';
    const cmd = `npm view ${packageName}@${versionSpec} --json`;
    const result = await exec(cmd, {cwd: root, maxBuffer: MAX_BUFFER_SIZE});
    const data = JSON.parse(result.trim());
    return !!(data.types || data.typings);
  } catch (error) {
    console.warn(
      `Failed to check bundled types for ${packageName}: ${error.message}`
    );
    return false;
  }
};

const findBestTypesVersion /*: FindBestTypesVersion */ = async (
  typesPackageName,
  versionRange,
  root,
  promptForTypesVersion
) => {
  try {
    const cmd = `npm view ${typesPackageName} versions --json`;
    const result = await exec(cmd, {cwd: root, maxBuffer: MAX_BUFFER_SIZE});
    const data = JSON.parse(result.trim());
    const versions = data || [];

    if (versions.length === 0) {
      console.warn(`No versions found for ${typesPackageName}`);
      return null;
    }

    // If no version range specified, use latest (highest version)
    if (!versionRange) {
      return rsort(versions)[0];
    }

    // Mirror the user's version specifier for @types
    let typesRange;
    if (versionRange.startsWith('~')) {
      // User specified tilde → use tilde for @types
      typesRange = versionRange;
    } else if (versionRange.startsWith('^')) {
      // User specified caret → use caret for @types
      typesRange = versionRange;
    } else {
      // User specified exact version → use tilde for @types
      typesRange = `~${versionRange}`;
    }

    const bestVersion = maxSatisfying(versions, typesRange);

    // If no compatible version found, trigger interactive prompt
    if (!bestVersion) {
      return await promptForTypesVersion(
        typesPackageName,
        versionRange,
        versions,
        true
      );
    }

    return bestVersion;
  } catch (error) {
    console.warn(
      `Failed to resolve @types version for ${typesPackageName}: ${error.message}`
    );
    return null;
  }
};

const getTypesPackages /*: GetTypesPackages */ = async (
  externals,
  root,
  roots,
  promptForTypesVersion
) => {
  const typesDeps = [];

  for (const {name, range} of externals) {
    // Skip if already a @types package
    if (name.startsWith('@types/')) continue;

    // Convert scoped packages: @babel/core → @types/babel__core
    const typesPackageName = name.startsWith('@')
      ? `@types/${name.slice(1).replace('/', '__')}`
      : `@types/${name}`;

    try {
      // Check if main package has bundled types
      const hasBundledTypes = await checkBundledTypes(name, range, root);
      if (hasBundledTypes) {
        console.log(
          `${name} has bundled types, removing separate @types package`
        );
        await removeTypesPackage(name, roots);
        continue;
      }

      // Find best @types version
      const typesVersion = await findBestTypesVersion(
        typesPackageName,
        range,
        root,
        promptForTypesVersion
      );
      if (typesVersion) {
        console.log(`Adding ${typesPackageName}@${typesVersion}`);
        typesDeps.push(`${typesPackageName}@${typesVersion}`);
      }
    } catch (error) {
      console.warn(`Failed to process types for ${name}: ${error.message}`);
      // Continue processing other packages
    }
  }

  return typesDeps;
};

const removeTypesPackage /*: RemoveTypesPackage */ = async (
  packageName,
  roots
) => {
  const {read, write} = require('./node-helpers.js');
  // Convert scoped packages: @babel/core → @types/babel__core
  const typesPackageName = packageName.startsWith('@')
    ? `@types/${packageName.slice(1).replace('/', '__')}`
    : `@types/${packageName}`;

  await Promise.all(
    roots.map(async cwd => {
      const meta = JSON.parse(await read(`${cwd}/package.json`, 'utf8'));
      let updated = false;

      // Remove from dependencies and devDependencies
      if (meta.dependencies && meta.dependencies[typesPackageName]) {
        delete meta.dependencies[typesPackageName];
        updated = true;
      }
      if (meta.devDependencies && meta.devDependencies[typesPackageName]) {
        delete meta.devDependencies[typesPackageName];
        updated = true;
      }

      if (updated) {
        await write(
          `${cwd}/package.json`,
          JSON.stringify(meta, null, 2) + '\n',
          'utf8'
        );
      }
    })
  );
};

module.exports = {
  checkBundledTypes,
  findBestTypesVersion,
  getTypesPackages,
  removeTypesPackage,
};
