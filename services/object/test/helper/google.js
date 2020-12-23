/**
 * The google test bucket was set up manually:
 *  * Create a service account, `object-service-test@taskcluster-dev.iam.gserviceaccount.com`.
 *    Do not grant it any roles.
 *  * Create a GCS bucket, `taskcluster-test`
 *    * "Region" location type (choice of region does not matter)
 *    * Standard storeage class
 *    * "Uniform" access control
 *    * No "Advanced Settings"
 *  * Under the bucket's "permissions" tab
 *    * Click add, paste the full name of the service account (this does not auto-complete)
 *      * Add roles "Storage Legacy Bucket Owner" and "Storage Legacy Object Owner" both under "Cloud Storage Legacy"
 *    * Click add, type "allUsers"
 *      * Add roles "Storage Object Viewer" under "Cloud Storage"
 *  * Under the bucket's "lifecycle" tab
 *    * Add a rule to delete objects after 1 day (this cleans up any leftovers from test runs)
 *  * In the Google Cloud Storage Settings view, "Interoperability" tab, create HMAC credentials for the service account
 *    and put those in the secret with GOOGLE_ACCESS_KEY_ID and GOOGLE_SECRET_ACCESS_KEY.
 */
exports.secret = [
  { env: 'GOOGLE_ACCESS_KEY_ID', name: 'accessKeyId' },
  { env: 'GOOGLE_SECRET_ACCESS_KEY', name: 'secretAccessKey' },
  { env: 'GOOGLE_TEST_BUCKET', name: 'testBucket' },
];
