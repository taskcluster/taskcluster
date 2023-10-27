import fs from 'fs';
import { strict as assert } from 'assert';
import testing from 'taskcluster-lib-testing';

import { newVersion, renumberVersions } from '../src/versions.js';

suite(testing.suiteName(), function() {
  test('new migration', async () => {
    const next1 = await newVersion({ runGit: false });
    const next2 = await newVersion({ runGit: false });

    assert(next1.version > 0, 'unexpected version');
    assert(next2.version > 0, 'unexpected version');
    assert(next1.version + 1 === next2.version, 'unexpected version');

    assert(next1.versionFile.endsWith(`${next1.version}.yml`), 'unexpected file name');
    assert(next1.testFile.endsWith(`${next1.version}_test.js`), 'unexpected test file name');

    assert(fs.existsSync(next1.versionFile), `version ${next1.versionFile} does not exist`);
    assert(fs.existsSync(next1.testFile), `version ${next1.testFile} test does not exist`);
    fs.rmSync(next1.versionFile);
    fs.rmSync(next1.testFile);

    assert(fs.existsSync(next2.versionFile), `version ${next2.versionFile} does not exist`);
    assert(fs.existsSync(next2.testFile), `version ${next2.testFile} test does not exist`);
    fs.rmSync(next2.versionFile);
    fs.rmSync(next2.testFile);
  });

  test('renumber versions', async () => {
    const migration = await newVersion({ runGit: false });

    await renumberVersions(migration.version, 5555, { runGit: false });

    // since we are not running git files would not be moved, only new file would be written

    const newVersionFile = migration.versionFile.replace(String(migration.version).padStart(4, '0'), '5555');
    assert(fs.existsSync(newVersionFile), `version ${newVersionFile} test does not exist`);

    const fileContents = fs.readFileSync(newVersionFile, 'utf8');
    assert(fileContents.includes('5555'), 'version not updated in file');
    fs.rmSync(newVersionFile);

    fs.rmSync(migration.versionFile);
    fs.rmSync(migration.testFile);
  });

  test('renumbering version exists', async () => {
    const mig1 = await newVersion({ runGit: false });
    const mig2 = await newVersion({ runGit: false });

    try {
      await renumberVersions(mig1.version, mig2.version, { runGit: false });
      assert(false, 'expected error');
    } catch (err) {
      assert(err.message.includes('already exists'), 'unexpected error');
    }

    fs.rmSync(mig1.versionFile);
    fs.rmSync(mig1.testFile);
    fs.rmSync(mig2.versionFile);
    fs.rmSync(mig2.testFile);
  });
});
