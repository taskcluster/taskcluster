const child_process = require('child_process');
const {PassThrough} = require('stream');

/**
 * Run a command and display its output.
 *
 * - dir -- directory to run command in
 * - command -- command to run (list of arguments)
 * - utils -- taskgraph utils (waitFor, etc.)
 */
exports.execCommand = async ({dir, command, utils}) => {
  const cp = child_process.spawn(command[0], command.slice(1), {
    cwd: dir,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const output = new PassThrough();
  cp.stdout.pipe(output);
  cp.stderr.pipe(output);

  await utils.waitFor(output);
  await new Promise((resolve, reject) => {
    cp.once('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Nonzero exit status ${code} from ${command[0]}`));
      }
    });
    cp.once('error', reject);
  });
};
