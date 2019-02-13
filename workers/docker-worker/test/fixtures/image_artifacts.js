// Task that contains both public and private docker image artifacts.  Was much
// easier to have a task used here that expires in 1 year than trying to recreate
// the test each time.

const IMAGE_TASK_ID = 'Xx0aPfyOTU2o_0FZnr_AJg';

module.exports = {
  // the taskcluster instance containing all of these resources
  ROOT_URL: 'https://taskcluster.net',

  NAMESPACE: 'garbage.docker-worker-tests.docker-images',

  TASK_ID: IMAGE_TASK_ID,

  TASK_IMAGE_ARTIFACT_HASH: 'sha256:ed4f8c2e0556d1a6b5179892daedfdb137b87088ef30c134ccc7cfb68d30057e',

  TASK_IMAGE_HASH: 'sha256:dc4491992653ecf02ae2d0e9d3dbdaab63af8ccdcab87ee0ee7e532f7087dd73',

  // LZ4 compressed image
  LZ4_TASK_ID: IMAGE_TASK_ID,

  // Zstandard compressed impage
  ZSTD_TASK_ID: IMAGE_TASK_ID,
};
