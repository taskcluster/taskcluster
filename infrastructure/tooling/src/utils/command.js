const fs = require('fs');
const child_process = require('child_process');
const {Transform} = require('stream');

/**
 * Run a command and display its output.
 *
 * - dir -- directory to run command in
 * - command -- command to run (list of arguments)
 * - utils -- taskgraph utils (waitFor, etc.)
 * - logfile -- log file to which to record output of command
 * - env -- optional environment variables for the command
 */
exports.execCommand = async ({
  dir,
  command,
  utils,
  stdin,
  logfile,
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

  if (logfile) {
    const logStream = fs.createWriteStream(logfile);
    cp.stdout.pipe(logStream);
    cp.stderr.pipe(logStream);
  }

  const stream = new Transform({
    transform: (chunk, encoding, callback) => {
      if (keepAllOutput) {
        output += chunk.toString();
      } else {
        output = '...\n' + chunk.toString();
      }
      callback(null, chunk);
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
        reject(new Error(`Nonzero exit status ${code}; see ${logfile} for details`));
      }
    });
    cp.once('error', reject);
  });
};
