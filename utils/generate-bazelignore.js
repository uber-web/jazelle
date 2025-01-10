// @flow
const {read, write} = require('./node-helpers.js');

/*::
export type GenerateBazelignoreArgs = {
  root: string,
  immutable: boolean,
};
// returns list of changed files
export type GenerateBazelignore = (GenerateBazelignoreArgs) => Promise<Array<string>>;
*/

const generateBazelignore /*: GenerateBazelignore */ = async ({
  root,
  immutable,
}) => {
  const fileName = '.bazelignore';
  const file = `${root}/${fileName}`;
  const bazelignore = await read(file, 'utf8').catch(() => '');
  const changedFiles /*: Array<string> */ = [];

  const ignorePaths = [
    ...new Set([
      'third_party/jazelle/temp',
      'node_modules',
      ...bazelignore.split('\n'),
    ]),
  ];
  const updated = ignorePaths.sort().filter(Boolean).join('\n');
  if (bazelignore.trim() !== updated.trim()) {
    changedFiles.push(fileName);

    if (!immutable) {
      await write(`${root}/.bazelignore`, updated + '\n', 'utf8');
    }
  }

  return changedFiles;
};

module.exports = {generateBazelignore};
