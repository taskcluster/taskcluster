# E2E Taskcluster UI tests

In order to run it locally you need to export taskcluster root and credentials:

```sh
export CYPRESS_TASKCLUSTER_ROOT_URL=https://stage.taskcluster.nonprod.cloudops.mozgcp.net/
export CYPRESS_TASKCLUSTER_ACCESS_TOKEN=^access-token%
export CYPRESS_TASKCLUSTER_CLIENT_ID=static/taskcluster/root
```

To run it interactively: `yarn cypress open` or `yarn test:open`

To run it with headless browser: `yarn cypress run` or `yarn test`
