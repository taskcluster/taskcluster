import debugFactory from 'debug';
const debug = debugFactory('test:expireTasks');
import slugid from 'slugid';
import taskcluster from '@taskcluster/client';
import assume from 'assume';
import helper from './helper.js';
import testing from '@taskcluster/lib-testing';
import { ListObjectsCommand, PutObjectCommand } from '@aws-sdk/client-s3';

helper.secrets.mockSuite(testing.suiteName(), ['aws'], function (mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withAmazonIPRanges(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withS3(mock, skipping);
  helper.withServer(mock, skipping);
  helper.resetTables(mock, skipping);

  const MAX_ARTIFACTS = 5;

  [
    ['expire s3 artifacts using bulk delete', true, undefined],
    ['expire s3 artifacts using single delete', false, undefined],
    ['expire s3 artifacts using single delete and batch size 1', false, 1],
  ].forEach(([name, useBulkDelete, batchSize]) =>
    test(name, async () => {
      const yesterday = taskcluster.fromNow('-1 day');
      const today = new Date();
      const taskId = slugid.nice();
      const bucket = await helper.load('publicArtifactBucket');

      await helper.load('cfg');
      helper.load.cfg('aws.useBulkDelete', useBulkDelete);
      if (batchSize) {
        helper.load.cfg('expireArtifactsBatchSize', batchSize);
      }

      for (let i = 0; i < MAX_ARTIFACTS; i++) {
        await helper.db.fns.create_queue_artifact_2(
          taskId,
          i,
          `name-${i}`,
          's3',
          'content-type',
          {
            bucket: bucket.bucket,
            prefix: `${taskId}/${i}/log.log`,
          },
          false,
          yesterday,
          null,
        );

        // create mock s3 object
        await bucket.s3.send(new PutObjectCommand({
          Bucket: bucket.bucket,
          Key: `${taskId}/${i}/log.log`,
          Body: 'hello',
        }));
      }

      // check that the s3 objects exist
      let objects = await bucket.s3.send(new ListObjectsCommand({
        Bucket: bucket.bucket,
        Prefix: `${taskId}/`,
      }));
      assume(objects.Contents.length).equals(MAX_ARTIFACTS);

      let rows = await helper.db.fns.get_expired_artifacts_for_deletion_2({
        expires_in: today,
        page_size_in: 1000,
      });
      assume(rows.length).equals(MAX_ARTIFACTS);

      debug('### Expire artifacts');
      await helper.runExpiration('expire-artifacts');

      rows = await helper.db.fns.get_expired_artifacts_for_deletion_2({
        expires_in: today,
        page_size_in: 1000,
      });
      assume(rows.length).equals(0);

      // check that the s3 objects are gone
      objects = await bucket.s3.send(new ListObjectsCommand({
        Bucket: bucket.bucket,
        Prefix: `${taskId}/`,
      }));
      assume(objects.Contents.length).equals(0);
    }),
  );

  [
    ['expire s3 artifacts handle missing ones using bulk delete', true],
    ['expire s3 artifacts handle missing ones using single delete', false],
  ].forEach(([name, useBulkDelete]) => test(name, async () => {
    const yesterday = taskcluster.fromNow('-1 day');
    const today = new Date();
    const taskId = slugid.nice();
    const bucket = await helper.load('publicArtifactBucket');

    await helper.load('cfg');
    helper.load.cfg('aws.useBulkDelete', useBulkDelete);

    const maxUploads = 1;

    for (let i = 0; i < MAX_ARTIFACTS; i++) {
      await helper.db.fns.create_queue_artifact_2(
        taskId,
        i,
        `name-${i}`,
        's3',
        'content-type',
        {
          bucket: bucket.bucket,
          prefix: `${taskId}/${i}/log.log`,
        },
        false,
        yesterday,
        null,
      );
    }
    // don't "upload" all files, just one to make them all fail during deletion
    await bucket.s3.send(new PutObjectCommand({
      Bucket: bucket.bucket,
      Key: `${taskId}/1/log.log`,
      Body: 'there can be only one',
    }));

    // check that the s3 objects exist
    let objects = await bucket.s3.send(new ListObjectsCommand({
      Bucket: bucket.bucket,
      Prefix: `${taskId}/`,
    }));
    assume(objects.Contents.length).equals(maxUploads);

    let rows = await helper.db.fns.get_expired_artifacts_for_deletion_2({
      expires_in: today,
      page_size_in: 1000,
    });
    assume(rows.length).equals(MAX_ARTIFACTS);

    debug('### Expire artifacts');
    await helper.runExpiration('expire-artifacts');

    rows = await helper.db.fns.get_expired_artifacts_for_deletion_2({
      expires_in: today,
      page_size_in: 1000,
    });
    assume(rows.length).equals(0);

    // check that the s3 objects are gone
    objects = await bucket.s3.send(new ListObjectsCommand({
      Bucket: bucket.bucket,
      Prefix: `${taskId}/`,
    }));
    assume(objects.Contents.length).equals(0);
  }));

  test('expire non s3 artifacts', async () => {
    const yesterday = taskcluster.fromNow('-1 day');
    const today = new Date();
    const taskId = slugid.nice();

    for (let i = 0; i < MAX_ARTIFACTS; i++) {
      await helper.db.fns.create_queue_artifact_2(
        taskId,
        i,
        `name-${i}`,
        'something-else',
        'content-type',
        {
          bucket: 'some-nonexisting-bucket',
          prefix: `${taskId}/${i}/log.log`,
        },
        false,
        yesterday,
        null,
      );
    }

    let rows = await helper.db.fns.get_expired_artifacts_for_deletion_2({
      expires_in: today,
      page_size_in: 1000,
    });
    assume(rows.length).equals(MAX_ARTIFACTS);

    debug('### Expire artifacts');
    await helper.runExpiration('expire-artifacts');

    rows = await helper.db.fns.get_expired_artifacts_for_deletion_2({
      expires_in: today,
      page_size_in: 1000,
    });
    assume(rows.length).equals(0);
  });
});

// GCS specific mock
helper.secrets.mockSuite(testing.suiteName(), ['aws'], function (mock, skipping) {
  if (!mock) {
    // see https://github.com/taskcluster/taskcluster/issues/6416 for details
    // at the moment real tests are done against AWS S3 and those patches would make no sense
    // errors would not be thrown, so they wouldn't be seen here
    return;
  }

  helper.withDb(mock, skipping);
  helper.withAmazonIPRanges(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withGCS(mock, skipping);
  helper.withServer(mock, skipping);
  helper.resetTables(mock, skipping);

  const MAX_ARTIFACTS = 5;

  let monitor;
  suiteSetup(async function () {
    monitor = await helper.load('monitor');
  });

  test('using bulk delete objects on GCS should fail', async () => {
    const yesterday = taskcluster.fromNow('-1 day');
    const today = new Date();
    const taskId = slugid.nice();
    const bucket = await helper.load('publicArtifactBucket');

    await helper.load('cfg');
    helper.load.cfg('aws.useBulkDelete', true);

    const artifactsToRemove = [];

    for (let i = 0; i < MAX_ARTIFACTS; i++) {
      await helper.db.fns.create_queue_artifact_2(
        taskId,
        i,
        `name-${i}`,
        's3',
        'content-type',
        {
          bucket: bucket.bucket,
          prefix: `${taskId}/${i}/log.log`,
        },
        false,
        yesterday,
        null,
      );
      artifactsToRemove.push({ task_id: taskId, run_id: i, name: `name-${i}` });
    }
    // create only one mock s3 object
    await bucket.s3.send(new PutObjectCommand({
      Bucket: bucket.bucket,
      Key: `${taskId}/1/log.log`,
      Body: 'hello',
    }));

    // check that the s3 objects exist
    let objects = await bucket.s3.send(new ListObjectsCommand({
      Bucket: bucket.bucket,
      Prefix: `${taskId}/`,
    }));
    assume(objects.Contents.length).equals(1);

    let rows = await helper.db.fns.get_expired_artifacts_for_deletion_2({
      expires_in: today,
      page_size_in: 1000,
    });
    assume(rows.length).equals(MAX_ARTIFACTS);

    // would log errors through monitor
    await helper.runExpiration('expire-artifacts');
    const errors = monitor.manager.messages.filter(m => m.Type === 'monitor.error');
    assume(errors.length).equals(1);
    assume(errors[0].Fields.message).matches(/InvalidArgument/);
    monitor.manager.reset();

    rows = await helper.db.fns.get_expired_artifacts_for_deletion_2({
      expires_in: today,
      page_size_in: 1000,
    });
    // nothing should be deleted since bulk delete will fail
    assume(rows.length).equals(MAX_ARTIFACTS);

    // check that the s3 objects are gone
    objects = await bucket.s3.send(new ListObjectsCommand({
      Bucket: bucket.bucket,
      Prefix: `${taskId}/`,
    }));
    assume(objects.Contents.length).equals(1);

    // clean up artifacts that were not removed
    await helper.db.fns.delete_queue_artifacts(
      JSON.stringify(artifactsToRemove),
    );
  });

  test('using single delete object on missing GCS artifacts should fail', async () => {
    const yesterday = taskcluster.fromNow('-1 day');
    const today = new Date();
    const taskId = slugid.nice();
    const bucket = await helper.load('publicArtifactBucket');

    await helper.load('cfg');
    helper.load.cfg('aws.useBulkDelete', false);

    for (let i = 0; i < MAX_ARTIFACTS; i++) {
      await helper.db.fns.create_queue_artifact_2(
        taskId,
        i,
        `name-${i}`,
        's3',
        'content-type',
        {
          bucket: bucket.bucket,
          prefix: `${taskId}/${i}/log.log`,
        },
        false,
        yesterday,
        null,
      );
    }
    // only upload one file
    await bucket.s3.send(new PutObjectCommand({
      Bucket: bucket.bucket,
      Key: `${taskId}/1/log.log`,
      Body: 'hello',
    }));

    // check that the s3 objects exist
    let objects = await bucket.s3.send(new ListObjectsCommand({
      Bucket: bucket.bucket,
      Prefix: `${taskId}/`,
    }));
    assume(objects.Contents.length).equals(1); // we only upload one file

    let rows = await helper.db.fns.get_expired_artifacts_for_deletion_2({
      expires_in: today,
      page_size_in: 1000,
    });
    assume(rows.length).equals(MAX_ARTIFACTS);

    // would log errors through monitor
    await helper.runExpiration('expire-artifacts');
    const [ result ] = monitor.manager.messages.filter(m => m.Type === 'expired-artifacts-removed');
    assume(result.Fields.count).equals(5);
    assume(result.Fields.errorsCount).equals(4);
    monitor.manager.reset();

    rows = await helper.db.fns.get_expired_artifacts_for_deletion_2({
      expires_in: today,
      page_size_in: 1000,
    });
    // all should be gone after
    assume(rows.length).equals(0);

    // check that the s3 objects are gone
    objects = await bucket.s3.send(new ListObjectsCommand({
      Bucket: bucket.bucket,
      Prefix: `${taskId}/`,
    }));
    assume(objects.Contents.length).equals(0);
  });
});
