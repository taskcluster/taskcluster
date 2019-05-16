/**
 * For now this just needs to submit a notice to coveralls
 * that the build is done since each other package submits coverage
 * independently.
 */
const got = require('got');

const main = async () => {
  await got.post('https://coveralls.io/webhook', {
    searchParams: new URLSearchParams([['repo_token', process.env.COVERALLS_REPO_TOKEN]]),
    body: JSON.stringify({
      payload: {
        build_num: process.env.COVERALLS_SERVICE_JOB_ID,
        status: 'done',
      },
    }),
  });
};

main().catch(console.error);
