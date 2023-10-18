import fs from 'fs';
import child_process from 'child_process';
import { Transform } from 'stream';

/**
 * Run a command and display its output.
 *
 * - dir -- directory to run command in
 * - command -- command to run (list of arguments)
 * - utils -- taskgraph utils (waitFor, etc.)
 * - logfile -- log file to which to record output of command
 * - keepAllOutput -- if true, keep and return the stdout
 * - env -- optional environment variables for the command
 */
export const execCommand = async ({
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
  return new Promise((resolve, reject) => {
    cp.once('close', code => {
      if (code === 0 || ignoreReturn) {
        resolve(output);
      } else {
        reject(new Error(`Nonzero exit status ${code}; ` +
          (logfile ? `see ${logfile} for details` : `\n${output}`)));
      }
    });
    cp.once('error', reject);
  });
};
