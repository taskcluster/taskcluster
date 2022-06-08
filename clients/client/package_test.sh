#!/bin/sh

set -e -x

# test that the package can be installed without other dependencies in the monorepo,
# by installing it in a temporary directory and checking that it can be require()d
# and call an API method

tmpdir=$(mktemp -d)
trap "cd /; rm -rf $tmpdir" EXIT

yarn pack --filename $tmpdir/client.tgz
cd $tmpdir
yarn add ./client.tgz
node <<'EOF'
const taskcluster = require('taskcluster-client');

const main = async () => {
    if (process.env.TASKCLUSTER_ROOT_URL) {
        const auth = new taskcluster.Auth(taskcluster.fromEnvVars());
        console.log(await auth.ping());
    } else {
        console.log('No TASKCLUSTER_ROOT_URL; not trying to call an API method');
    }
};
main().then(console.log('Test OK!'), err => console.error(err));
EOF
