// Task that contains both public and private docker image artifacts.  Was much
// easier to have a task used here that expires in 1 year than trying to recreate
// the test each time.

const IMAGE_TASK_ID = 'csTL863FQYCK82XEFjMhMw';

module.exports = {
  // the taskcluster instance containing all of these resources
  ROOT_URL: 'https://community-tc.services.mozilla.com',

  NAMESPACE: 'garbage.docker-worker-tests.docker-images',

  TASK_ID: IMAGE_TASK_ID,

  TASK_IMAGE_ARTIFACT_HASH: 'sha256:5902ab563a408265fd18d4a3215335bba1d29ee16e3f1b3e39b70689da894830',

  TASK_IMAGE_HASH: 'sha256:2ca708c1c9ccc509b070f226d6e4712604e0c48b55d7d8f5adc9be4a4d36029a',

  // LZ4 compressed image
  LZ4_TASK_ID: IMAGE_TASK_ID,

  // Zstandard compressed impage
  ZSTD_TASK_ID: IMAGE_TASK_ID,
};
