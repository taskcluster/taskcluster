// Task that contains both public and private docker image artifacts.  Was much
// easier to have a task used here that expires in 1 year than trying to recreate
// the test each time.
export const NAMESPACE = 'garbage.docker-worker-tests.docker-images.P3nOQmLVSzGaFZzUcYzHMw';

export const TASK_ID = 'Nj-YlJwFSMez_eqh2fBI3g';

// LZ4 compressed image
export const LZ4_TASK_ID = 'Bs7M5ZpLRy-Wz_WdwjJrNw';

// Zstandard compressed impage
export const ZSTD_TASK_ID = 'NbX_D1kMQ26AG0MV-elObg';
