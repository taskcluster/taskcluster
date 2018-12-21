const docs = require('..');

const main = async () => {
  let env = v => {
    if (!process.env[v]) {
      throw new Error(`Environment variable ${v} must be set`);
    }
    return process.env[v];
  };

  await docs.documenter({
    // use the taskclusterProxy if running in a task
    authBaseUrl: process.env.TASK_ID ? 'http://taskcluster/auth/v1' : undefined,
    project: env('DOCS_PROJECT'),
    tier: env('DOCS_TIER'),
    docsFolder: env('DOCS_FOLDER'),
    readme: env('DOCS_README'),
    publish: true,
  });
};

if (!module.parent) {
  main().catch(err => {
    console.log(err);
    console.log(err.stack);
    process.exit(1);
  });
}
