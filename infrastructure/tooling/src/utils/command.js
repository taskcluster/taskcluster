import fs from 'fs';
import { promisify } from 'util';
import child_process from 'child_process';
import { Transform } from 'stream';

const execCommandNative = promisify(child_process.exec);

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
    cp.stdout.pipe(logStream, { end: false });
    cp.stderr.pipe(logStream, { end: false });

    let stdoutEnded = false;
    let stderrEnded = false;

    const checkToCloseStream = () => {
      if (stdoutEnded && stderrEnded) {
        logStream.end();
      }
    };

    cp.stdout.on('end', () => {
      stdoutEnded = true;
      checkToCloseStream();
    });

    cp.stderr.on('end', () => {
      stderrEnded = true;
      checkToCloseStream();
    });
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
  cp.stdout.pipe(stream, { end: false });
  cp.stderr.pipe(stream, { end: false });

  let stdoutEnded = false;
  let stderrEnded = false;

  const checkToCloseStream = () => {
    if (stdoutEnded && stderrEnded) {
      stream.end();
    }
  };

  cp.stdout.on('end', () => {
    stdoutEnded = true;
    checkToCloseStream();
  });

  cp.stderr.on('end', () => {
    stderrEnded = true;
    checkToCloseStream();
  });

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

export const checkExecutableExists = async (executable) => {
  const command = process.platform === 'win32' ? 'where' : 'which';
  try {
    await execCommandNative(`${command} ${executable}`);
    return true;
  } catch (error) {
    return false;
  }
};
