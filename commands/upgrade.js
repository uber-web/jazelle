// @flow
const { minVersion, satisfies, valid } = require('../utils/cached-semver');
const { maxSatisfying } = require('../vendor/semver/semver.js');
const { getManifest } = require('../utils/get-manifest.js');
const { findLocalDependency } = require('../utils/find-local-dependency.js');
const { read, write, exec } = require('../utils/node-helpers.js');
const { spawn } = require('../utils/node-helpers.js');
const { node, yarn } = require('../utils/binary-paths.js');
const inquirer = require('inquirer');

/*::
export type UpgradeArgs = {
  root: string,
  args: Array<string>,
  interactive?: boolean,
};
export type Upgrade = (UpgradeArgs) => Promise<void>;
*/
const upgrade /*: Upgrade */ = async ({ root, args, interactive = true }) => {
  const { projects } = await getManifest({ root });
  const roots = projects.map(dir => `${root}/${dir}`);

  // group by whether the dep is local (listed in manifest.json) or external (from registry)
  const locals = [];
  const externals = [];
  for (const arg of args) {
    let [, name, version] = arg.match(/(@?[^@]*)@?(.*)/) || [];
    const local = await findLocalDependency({ root, name });
    if (local) locals.push({ local, name, version });
    else externals.push({ name, range: version });
  }

  if (locals.length > 0) {
    await Promise.all(
      roots.map(async cwd => {
        const meta = JSON.parse(await read(`${cwd}/package.json`, 'utf8'));

        for (const { local, name, version } of locals) {
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
    const deps = externals.map(({ name, range }) => {
      return name + (range ? `@${range}` : '');
    });
    // Add @types packages
    const typesDeps = await getTypesPackages(externals, root, roots, interactive);
    await spawn(node, [yarn, 'up', '-C', ...deps, ...typesDeps, '--mode', 'skip-build'], {
      cwd: root,
      stdio: 'inherit',
    });
  }
};

const getTypesPackages = async (externals, root, roots, interactive = true) => {
  const typesDeps = [];

  for (const { name, range } of externals) {
    // Skip if already a @types package
    if (name.startsWith('@types/')) continue;

    const typesPackageName = `@types/${name}`;

    try {
      // Check if main package has bundled types
      const hasBundledTypes = await checkBundledTypes(name, range, root);
      if (hasBundledTypes) {
        console.log(`${name} has bundled types, removing separate @types package`);
        await removeTypesPackage(name, roots)
        continue;
      }
      // Find best @types version
      const typesVersion = await findBestTypesVersion(typesPackageName, range, root, interactive);
      if (typesVersion) {
        console.log(`Adding ${typesPackageName}@${typesVersion}`);
        typesDeps.push(`${typesPackageName}@${typesVersion}`);
      }
    } catch (error) {
      // Silently skip on errors to avoid breaking the main upgrade
    }
  }

  return typesDeps;
};

const checkBundledTypes = async (packageName, versionRange, root) => {
  try {
    const versionSpec = versionRange || 'latest';
    const cmd = `${node} ${yarn} info ${packageName}@${versionSpec} --json`;
    const result = await exec(cmd, { cwd: root, maxBuffer: 5 * 1024 * 1024 });
    const data = JSON.parse(result.trim());
    return !!(data.types || data.typings);
  } catch (error) {
    return false;
  }
};

const promptForTypesVersion = async (typesPackageName, originalRange, versions, interactive = true) => {
  const latest = versions[versions.length - 1];
  const recentVersions = versions.slice(-10); // Show last 10 versions

  console.log(`\nNo compatible @types version found for ${typesPackageName} with range "${originalRange}"`);
  console.log(`Available versions: ${recentVersions.join(', ')}`);

  // In non-interactive mode, skip the package
  if (!interactive) {
    console.log(`Skipping ${typesPackageName} (non-interactive mode)`);
    return null;
  }

  const choices = [
    { name: `Use latest version (${latest})`, value: latest },
    { name: 'Enter a specific version manually', value: 'manual' },
    { name: 'Skip this package', value: 'skip' },
    { name: 'Abort the upgrade process', value: 'abort' }
  ];

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: `What would you like to do for ${typesPackageName}?`,
      choices
    }
  ]);

  if (action === 'latest') {
    return latest;
  } else if (action === 'manual') {
    const { manualVersion } = await inquirer.prompt([
      {
        type: 'input',
        name: 'manualVersion',
        message: 'Enter the specific version:',
        validate: (input) => {
          if (!input.trim()) return 'Version cannot be empty';
          if (!versions.includes(input.trim())) {
            return `Version "${input.trim()}" not found. Available versions: ${versions.join(', ')}`;
          }
          return true;
        }
      }
    ]);
    return manualVersion.trim();
  } else if (action === 'skip') {
    return null;
  } else if (action === 'abort') {
    throw new Error('Upgrade process aborted by user');
  }
};

const findBestTypesVersion = async (typesPackageName, versionRange, root, interactive = true) => {
  try {
    // Get all versions
    const cmd = `${node} ${yarn} info ${typesPackageName} versions --json`;
    const result = await exec(cmd, { cwd: root, maxBuffer: 5 * 1024 * 1024 });
    const data = JSON.parse(result.trim());
    const versions = data.versions || data || [];

    if (versions.length === 0) return null;
    // If no version range specified, use latest
    if (!versionRange) {
      return versions[versions.length - 1];
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
      return await promptForTypesVersion(typesPackageName, versionRange, versions, interactive);
    }

    return bestVersion;
  } catch (error) {
    return null;
  }
};

const removeTypesPackage = async (packageName, roots) => {
  const typesPackageName = `@types/${packageName}`;

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

const update = (meta, type, name, version, from) => {
  if (meta[type] && meta[type][name]) {
    const curr = meta[type][name];
    const inRange = !valid(curr) || !from || satisfies(minVersion(curr), from);
    if (inRange && !meta[type][name].includes('*')) meta[type][name] = version;
  }
};

module.exports = {
  upgrade,
  findBestTypesVersion,
  checkBundledTypes,
  getTypesPackages,
  removeTypesPackage,
  promptForTypesVersion
};
