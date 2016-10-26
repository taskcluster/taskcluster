/**
 * Ad-hoc scans of tables or S3 buckets.
 *
 * This file contains skeletons of functions to scan Azure tables or S3.
 *
 * To use, modify or add a scanning function below and make it the default export,
 * then run `npm compile && NODE_ENV=production node lib/main.js scan`.  You will
 * need AWS or Azure credentials (depending on what you're up to), and should also
 * set monitor.mock: false in your user-config.yml.
 *
 * If your scan will be useful in the future, feel free to check it in, otherwise
 * this can be hacked on in your working copy.
 *
 * See src/main.js for the arguments supplied to the scan function.
 */

let base                = require('taskcluster-base');
let _                   = require('lodash');

const SLUGID_CHARACTERS = (
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
  'abcdefghijklmnopqrstuvwxyz' +
  '0123456789_-'
).split('');

/**
 * Determine the gecko branch for a task, if it has one
 *
 * special branches:
 *  *-bb -- uploaded by buildbot
 *  cratertest -- crater jobs
 *  buildbot-bridge -- tasks run via bbb
 *  mshal-testing -- old indexing-testing jobs
 */
let branchRoutePattern = new RegExp(
  '^(index\\.garbage\\.staging|index\\.buildbot\\.branches|index\\.gecko\\.v[12]' +
  '|tc-treeherder(-stage)?(\\.v2)?)\\.([^.]*)\\..*/'
);
let taskBranch = (task) => {
  if (task.workerType == 'cratertest') {
    return 'cratertest';
  } else if (task.workerType == 'buildbot-bridge') {
    return 'buildbot-bridge';
  }

  let branch;
  task.routes.forEach((r) => {
    let res = branchRoutePattern.exec(r);
    if (res) {
      branch = res[4];
    }
  });

  // null-provisioner is what mozharness uses when it uploads artifacts
  if (branch && task.provisionerId === 'null-provisioner') {
    branch += '-bb';
  }

  if (!branch) {
    branch = 'unknown';
  }

  return branch;
};

/**
 * Determine the Gecko platform/type for a task
 */
let taskPlatform = (task) => {
  let platform = 'unknown';

  if (task.extra.treeherder) {
    let th = task.extra.treeherder;
    if (th.machine && th.machine.platform) {
      platform = th.machine.platform;
      if (th.collection) {
        Object.keys(th.collection).forEach((opt_coll_label) => {
          platform = platform + '/' + opt_coll_label;
        });
      }
    }
  }

  return platform;
};

let scanTasks = async ({cfg, Artifact, Task, publicArtifactBucket}) => {
  await Task.scan({
    // add basic filters here to speed up the scan, e.g.,
    provisionerId: base.Entity.op.eq('aws-provisioner-v1'),
  }, {
    limit: 500,
    handler: async (task) => {
      // ...
    },
  });
};

/**
 * Scan all versions of all objects in the public artifact bucket.  Note
 * that with a bit of work you can use `s3.listObjects` instead to skip
 * all but the latest version.
 */
let scanObjectVersions = async ({cfg, Artifact, Task, publicArtifactBucket}) => {
  const s3 = publicArtifactBucket.s3;

  // This operation is parallelized into 64 simultaneous operations, to avoid
  // the awful slowness of a single chained ListObjects call
  await Promise.all(SLUGID_CHARACTERS.map(async initialChar => {
    const params = {MaxKeys: 10000, Prefix: initialChar};
    while (1) {
      let res = await s3.listObjectVersions(params).promise();

      res.data.Versions.forEach((obj) => {
        // ...
      });

      res.data.DeleteMarkers.forEach((obj) => {
        // ...
      });

      if (!res.data.IsTruncated) {
        break;
      }

      params.KeyMarker = res.data.NextKeyMarker;
      params.VersionIdMarker = res.data.NextVersionIdMarker;
    };
  }));
};

let scanObjects = async ({cfg, Artifact, Task, publicArtifactBucket}) => {
  const s3 = publicArtifactBucket.s3;

  // This operation is parallelized into 64 simultaneous operations, to avoid
  // the awful slowness of a single chained ListObjects call
  await Promise.all(SLUGID_CHARACTERS.map(async initialChar => {
    const params = {MaxKeys: 10000, Prefix: initialChar};
    while (1) {
      const res = await s3.listObjects(params).promise();

      res.data.Contents.forEach((obj) => {
        // ...
      });

      if (!res.data.IsTruncated) {
        break;
      }

      // use the NextMarker key from the last object
      const contents = res.data.Contents;
      params.Marker = res.data.NextMarker || contents[contents.length-1].Key;
    }
  }));
};

module.exports = scanObjectVersions;
