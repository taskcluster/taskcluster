import fs from 'fs';
import path from 'path';
import child_process from 'child_process';
import yaml from 'js-yaml';

const dbDir = new URL('..', import.meta.url).pathname;

const filePath = /** @param {string} file */(file) => path.join(dbDir, 'versions', file);
const testPath = /** @param {string} file */(file) => path.join(dbDir, 'test/versions', file);

/**
 * @param {string[]} command
 * @returns {Promise<void>}
 */
const run = async command => {
  const proc = child_process.spawn(command[0], command.slice(1), {
    stdio: 'inherit',
  });

  return new Promise((resolve, reject) => {
    proc.once('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error('command failed'));
      }
    });
    proc.once('error', reject);
  });
};

/**
 * @param {number|string} fromVersion
 * @param {number|string} toVersion
 * @param {Partial<{ runGit: boolean }>} opts
*/
export const renumberVersions = async (fromVersion, toVersion, opts = {}) => {
  const options = {
    runGit: true,
    ...opts,
  };

  fromVersion = String(fromVersion).padStart(4, '0');
  toVersion = String(toVersion).padStart(4, '0');

  const renames = [];
  const fromVersionFile = filePath(`${fromVersion}.yml`);
  const toVersionFile = filePath(`${toVersion}.yml`);
  if (fs.existsSync(toVersionFile)) {
    throw new Error(`${toVersionFile} already exists`);
  }
  renames.push([fromVersionFile, toVersionFile]);

  let versionContent = fs.readFileSync(fromVersionFile, 'utf8');
  const version = yaml.load(versionContent);

  versionContent = versionContent.replace(/^version: \d+/, `version: ${parseInt(toVersion)}`);

  if (version.migrationScript && !version.migrationScript.includes('\n')) {
    const newMigrationScript = version.migrationScript.replace(fromVersion, toVersion);
    console.log(newMigrationScript);
    renames.push([
      filePath(`${version.migrationScript}`),
      filePath(`${newMigrationScript}`),
    ]);
    versionContent = versionContent.replace(`migrationScript: ${version.migrationScript}`, `migrationScript: ${newMigrationScript}`);
  }
  if (version.downgradeScript && !version.downgradeScript.includes('\n')) {
    const newDowngradeScript = version.downgradeScript.replace(fromVersion, toVersion);
    renames.push([
      filePath(`${version.downgradeScript}`),
      filePath(`${newDowngradeScript}`),
    ]);
    versionContent = versionContent.replace(`downgradeScript: ${version.downgradeScript}`, `downgradeScript: ${newDowngradeScript}`);
  }

  const fromTestFile = testPath(`${fromVersion}_test.js`);
  if (fs.existsSync(fromTestFile)) {
    renames.push([fromTestFile, fromTestFile.replace(fromVersion, toVersion)]);
  }

  for (let [s, d] of renames) {
    console.log(`${s} -> ${d}`);
    if (options.runGit) {
      await run(['git', 'mv', s, d]);
    }
  }

  try {
    console.log(`update ${toVersionFile}`);
    const fd = fs.openSync(toVersionFile, 'w');
    fs.writeFileSync(fd, versionContent, 'utf8');
    fs.closeSync(fd);
    if (options.runGit) {
      await run(['git', 'add', toVersionFile]);
    }
  } catch (err) {
    throw new Error(`Cannot write file ${toVersionFile}: ${err}}`);
  }

};

/**
 * migration script
 * @param {number} version
 */
const versionTemplate = version => `version: ${version}
description: add description here
migrationScript: |-
  begin
    -- add migration script here
  end
downgradeScript: |-
  begin
    -- add downgrade script here
  end
methods:
# new_method:
#    description: |
#      add description
#    mode: <read|write>
#    serviceName: <service_name>
#    args: arg1 txt
#    returns: table (out text)
#    body: |-
#      begin
#        return ( select * from table limit 10 );
#      end
`;

/**
 * test for new migration
 * @param {number} version
 */
const testTemplate = version => `import testing from '@taskcluster/lib-testing';

suite(testing.suiteName(), function() {
  // add tests if necessary
});
`;

/**
 * @param {{ runGit?: boolean }} options
 */
export const newVersion = async (options = { runGit: true }) => {
  // find latest version
  const versions = fs.readdirSync(filePath(''));
  const latestVersion = versions.filter(name => name.endsWith('.yml')).sort().pop()?.replace(/\.yml$/, '');
  const nextVersion = parseInt(latestVersion || '0') + 1;
  const newVersion = nextVersion.toString().padStart(4, '0');

  const newVersionFile = filePath(`${newVersion}.yml`);
  const newTestFile = testPath(`${newVersion}_test.js`);

  try {
    console.log(`Creating files for version ${newVersion}`);
    const fd = fs.openSync(newVersionFile, 'wx'); // x throws if file exists
    fs.writeFileSync(fd, versionTemplate(nextVersion), 'utf8');
    fs.closeSync(fd);
    console.log(`${newVersion}.yml written`);
  } catch (err) {
    throw new Error(`Cannot write file ${newVersionFile}: ${err}}`);
  }

  try {
    const fd = fs.openSync(newTestFile, 'wx');
    fs.writeFileSync(fd, testTemplate(nextVersion), 'utf8');
    fs.closeSync(fd);
    console.log(`${newVersion}_test.js written`);
  } catch (err) {
    throw new Error(`Cannot write file ${newTestFile}: ${err}`);
  }

  if (options.runGit) {
    await run(['git', 'add', newVersionFile, newTestFile]);
  }

  return {
    version: nextVersion,
    versionFile: newVersionFile,
    testFile: newTestFile,
  };
};
