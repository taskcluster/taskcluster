// Task that contains both public and private docker image artifacts.  Was much
// easier to have a task used here that expires in 1 year than trying to recreate
// the test each time.

const IMAGE_TASK_ID = 'Xx0aPfyOTU2o_0FZnr_AJg';

module.exports = {
  NAMESPACE: 'garbage.docker-worker-tests.docker-images',

  TASK_ID: IMAGE_TASK_ID,

  TASK_IMAGE_ARTIFACT_HASH: 'sha256:0d79355a83063d592285e529460af86e429754a5b98cdbc0366962b521af8006',

  TASK_IMAGE_HASH: 'sha256:dcf5b7936f77be812c8a17ba8284d198e3afcf57fb11bb2ab4311a511bf95f39',

  // LZ4 compressed image
  LZ4_TASK_ID: IMAGE_TASK_ID,

  // Zstandard compressed impage
  ZSTD_TASK_ID: IMAGE_TASK_ID,
};
