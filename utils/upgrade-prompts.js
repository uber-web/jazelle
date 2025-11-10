// @flow
const prompts = require('../vendor/prompts');
const {rsort} = require('../vendor/semver');

/*::
type PromptForTypesVersion = (
  string,
  ?string,
  Array<string>,
  boolean
) => Promise<?string>;
*/

const createPromptChoices = latest => [
  {title: `Use latest version (${latest})`, value: 'latest'},
  {title: 'Enter a specific version manually', value: 'manual'},
  {title: 'Skip this package', value: 'skip'},
  {title: 'Abort the upgrade process', value: 'abort'},
];

const promptForManualVersion = async versions => {
  const {manualVersion} = await prompts({
    type: 'text',
    name: 'manualVersion',
    message: 'Enter the specific version:',
    validate: input => {
      if (!input.trim()) return 'Version cannot be empty';
      if (!versions.includes(input.trim())) {
        return `Version "${input.trim()}" not found. Available versions: ${versions.join(
          ', '
        )}`;
      }
      return true;
    },
  });
  return manualVersion ? manualVersion.trim() : null;
};

const handlePromptAction = async (action, latest, versions) => {
  switch (action) {
    case 'latest':
      return latest;
    case 'manual':
      return await promptForManualVersion(versions);
    case 'skip':
      return null;
    case 'abort':
      throw new Error('Upgrade process aborted by user');
    default:
      return null;
  }
};

const promptForTypesVersion /*: PromptForTypesVersion */ = async (
  typesPackageName,
  originalRange,
  versions,
  interactive = true
) => {
  // Sort versions to find the actual latest (highest) version
  const sortedVersions = rsort(versions);
  const latest = sortedVersions[0]; // First element after reverse sort
  const recentVersions = sortedVersions.slice(0, 10); // Show top 10 versions

  console.log(
    `\nNo compatible @types version found for ${typesPackageName} with range "${
      originalRange || 'unspecified'
    }"`
  );
  console.log(`Available versions: ${recentVersions.join(', ')}`);

  // In non-interactive mode, skip the package
  if (!interactive) {
    console.log(`Skipping ${typesPackageName} (non-interactive mode)`);
    return null;
  }

  const choices = createPromptChoices(latest);

  const {action} = await prompts({
    type: 'select',
    name: 'action',
    message: `What would you like to do for ${typesPackageName}?`,
    choices,
  });

  return action ? await handlePromptAction(action, latest, versions) : null;
};

module.exports = {
  promptForTypesVersion,
};
