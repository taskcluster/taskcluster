/**
 * The google test bucket was set up manually.
 * The taskcluster-dev project was manually configured to be the default project.
 * The test bucket has bucket-level permissions.
 * There is no retention policy, since tests need to delete objects almost immediately.
 *
 * Console view:
 *   https://console.cloud.google.com/storage/browser/taskcluster-test
 *
 * Access control
 *   Uniform: No object-level ACLs enabled
 *
 * Permissions
 *   allUsers: Storage Object Viewer
 *   Editors of project taskcluster-dev: [Storage Legacy Bucket Owner, Storage Legacy Object Owner]
 *   Owners of project taskcluster-dev: [Storage Legacy Bucket Owner, Storage Legacy Object Owner]
 *   Viewers of project taskcluster-dev: [Storage Legacy Bucket Reader, Storage Legacy Object Reader]
 */
exports.secret = [
  { env: 'GOOGLE_ACCESS_KEY_ID', name: 'accessKeyId' },
  { env: 'GOOGLE_SECRET_ACCESS_KEY', name: 'secretAccessKey' },
  { env: 'GOOGLE_TEST_BUCKET', name: 'testBucket' },
];
