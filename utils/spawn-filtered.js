// @flow

const {spawn} = require('./node-helpers');

/*::
import type {SpawnOptions} from './node-helpers.js';

export type SpawnFilteredOptions = {
  spawnOpts?: SpawnOptions,
  verbose: boolean,
};

export type SpawnFiltered = (string, Array<string>, SpawnFilteredOptions) => Promise<void>;
*/

/**
 * A special utility for spawning yarn processes which filters
 * out noisy stdout/stderr
 */
const spawnFiltered /*: SpawnFiltered */ = async (cmd, args, opts) => {
  const spawnOpts = opts.spawnOpts || {};

  if (opts.verbose) {
    spawnOpts.stdio = 'inherit';
  } else if (!spawnOpts.stdio) {
    spawnOpts.env = {
      ...spawnOpts.env,
      // FORCE_COLOR is for the chalk package used by yarn
      FORCE_COLOR: '1',
    };
    spawnOpts.filterOutput = filterOutput;
  }

  return spawn(cmd, args, spawnOpts);
};

function filterOutput(line, type) {
  return (
    !/doesn't provide .+ requested by /.test(line) &&
    !/provides .+ requested by /.test(line) &&
    !/can't be found in the cache and will be fetched/.test(line) &&
    !/\[MODULE_NOT_FOUND\]/.test(line)
  );
}

module.exports.spawnFiltered = spawnFiltered;
