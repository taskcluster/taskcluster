const fs = require('fs');
const child_process = require('child_process');
const yaml = require('js-yaml');

/**
 * A very temporary script to renumber DB versions, which is helpful when lots
 * of people are writing DB versions.
 *
 * Run as, for example to renumber version 21 to 22,
 *
 *   node infrastructure/renumber-db-version.js 21 22
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

const main = async () => {
  const fromVersion = process.argv[2].padStart(4, '0');
  const toVersion = process.argv[3].padStart(4, '0');

  const renames = [];
  const fromVersionFile = `db/versions/${fromVersion}.yml`;
  const toVersionFile = `db/versions/${toVersion}.yml`;
  if (fs.existsSync(toVersionFile)) {
    throw new Error(`${toVersionFile} already exists`);
  }
  renames.push([fromVersionFile, toVersionFile]);

  let versionContent = fs.readFileSync(fromVersionFile, 'utf8');
  const version = yaml.safeLoad(versionContent);

  versionContent = versionContent.replace(/^version: \d+/, `version: ${parseInt(toVersion)}`);

  if (!version.migrationScript.includes('\n')) {
    const newMigrationScript = version.migrationScript.replace(fromVersion, toVersion);
    console.log( newMigrationScript);
    renames.push([`db/versions/${version.migrationScript}`, `db/versions/${newMigrationScript}`]);
    versionContent = versionContent.replace(`migrationScript: ${version.migrationScript}`, `migrationScript: ${newMigrationScript}`);
  }
  if (!version.downgradeScript.includes('\n')) {
    const newDowngradeScript = version.downgradeScript.replace(fromVersion, toVersion);
    renames.push([`db/versions/${version.downgradeScript}`, `db/versions/${newDowngradeScript}`]);
    versionContent = versionContent.replace(`downgradeScript: ${version.downgradeScript}`, `downgradeScript: ${newDowngradeScript}`);
  }

  const fromTestFile = `db/test/versions/${fromVersion}_test.js`;
  if (fs.existsSync(fromTestFile)) {
    renames.push([fromTestFile, fromTestFile.replace(fromVersion, toVersion)]);
  }

  for (let [s, d] of renames) {
    console.log(`${s} -> ${d}`);
    await run(['git', 'mv', s, d]);
  }

  console.log(`update ${toVersionFile}`);
  fs.writeFileSync(toVersionFile, versionContent, 'utf8');
  await run(['git', 'add', toVersionFile]);
};

main().catch(err => console.log(err));
