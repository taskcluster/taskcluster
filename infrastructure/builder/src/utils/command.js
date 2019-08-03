const child_process = require('child_process');
const {Transform} = require('stream');

/**
 * Run a command and display its output.
 *
 * - dir -- directory to run command in
 * - command -- command to run (list of arguments)
 * - utils -- taskgraph utils (waitFor, etc.)
 * - env -- optional environment variables for the command
 */
exports.execCommand = async ({
  dir,
  command,
  utils,
  stdin,
  keepAllOutput = false,
  env = process.env,
  ignoreReturn = false,
}) => {
  const cp = child_process.spawn(command[0], command.slice(1), {
    cwd: dir,
    env,
    stdio: [stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
  });

  let output = '';

  const stream = new Transform({
    transform: (chunk, encoding, callback) => {
      if (keepAllOutput) {
        output += chunk.toString();
      } else {
        output = '...\n' + chunk.toString();
      }
      callback(null, output);
    },
  });
  cp.stdout.pipe(stream);
  cp.stderr.pipe(stream);
  if (stdin) {
    cp.stdin.write(stdin);
    cp.stdin.end();
  }

  await utils.waitFor(stream);
  return await new Promise((resolve, reject) => {
    cp.once('close', code => {
      if (code === 0 || ignoreReturn) {
        resolve(output);
      } else {
        reject(new Error(`Nonzero exit status ${code} from ${command[0]}:\n${output}`));
      }
    });
    cp.once('error', reject);
  });
};
