import { spawn } from 'node:child_process';

/** Run a command, streaming its output, and resolve with its exit code and captured output. */
export const exec = (command, { cwd, env = process.env } = {}) =>
  new Promise((resolve, reject) => {
    const proc = spawn(command[0], command.slice(1), { cwd, env });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', chunk => {
      stdout += chunk;
      process.stdout.write(chunk);
    });
    proc.stderr.on('data', chunk => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    proc.on('error', reject);
    proc.on('close', code => resolve({ code, stdout, stderr }));
  });
