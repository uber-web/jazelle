// @flow
/*::
import type {Args} from './parse-argv.js';

export type Cli = (string, Args, CliOptions, CliAction) => Promise<void>;
export type CliOptions = {[string]: [string, CliAction]};
export type CliAction = (Args) => Promise<?mixed>;
*/
const cli /*: Cli */ = async (command, args, options, fallback) => {
  if (command == null || ['-h', '--help', 'help'].includes(command)) {
    const keys = Object.keys(options).sort();
    const maxWidth = Math.max(...keys.map(key => key.length));
    console.log(`\nUsage: jazelle [command]\n`);
    console.log(`Commands:`);
    keys.forEach(key => {
      // eslint-disable-next-line no-unused-vars
      const [description, ...rest] = options[key][0].split('\n');
      const space = ' '.repeat(maxWidth - key.length + 4);
      console.log(`  ${key}${space}${description}`);
    });
    console.log('');
  } else {
    try {
      if (!options[command]) {
        await fallback(args);
      } else {
        const [docs, fn] = options[command];
        if (args.help) {
          const [description, ...lines] = docs
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean);
          const args = lines
            .map(line => (line.trim().match(/(.+?)\s{2,}/) || [])[1])
            .join(' ');
          const usage = `Usage: jazelle ${command} ${args}`;
          console.log(`\n${description}\n\n${usage}\n`);
          if (lines.length)
            console.log(
              `Args:\n${lines.map(line => `  ${line}`).join('\n')}\n`
            );
        } else {
          await fn(args);
        }
      }
    } catch (error) {
      if (error instanceof CliError) {
        console.error(error.message);
        process.exit(error.exitCode);
      } else {
        console.error(error.stack);
        if (typeof error.status === 'number') {
          process.exit(error.status);
        } else {
          process.exit(1);
        }
      }
    }
  }
};

/**
 * A way for a CLI command to control the error message
 * that's emitted and the exit code of the process.
 */
class CliError extends Error {
  /*:: exitCode: number; */

  constructor(message /*: string */, exitCode /*: number */) {
    super(message);
    this.exitCode = exitCode;
  }
}

module.exports = {cli, CliError};
