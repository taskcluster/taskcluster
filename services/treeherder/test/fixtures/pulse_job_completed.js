let completed = `
{
  "payload": {
    "status": {
      "taskId": "5UMTRzgESFG3Bn8kCBwxxQ",
      "provisionerId": "aws-provisioner-v1",
      "workerType": "DUMMYWORKERTYPE",
      "schedulerId": "task-graph-scheduler",
      "taskGroupId": "DUMMYGROUPID",
      "deadline": "2016-04-14T17:21:28.391Z",
      "expires": "2017-04-14T17:21:28.391Z",
      "retriesLeft": 5,
      "state": "completed",
      "runs": [
        {
          "runId": 0,
          "state": "completed",
          "reasonCreated": "scheduled",
          "scheduled": "2016-04-13T17:21:59.504Z",
          "workerGroup": "us-east-1d",
          "workerId": "i-dummyworkerid",
          "takenUntil": "2016-04-13T18:43:35.127Z",
          "started": "2016-04-13T17:22:02.037Z",
          "reasonResolved": "completed",
          "resolved": "2016-04-13T18:28:23.726Z"
        }
      ]
    },
    "runId": 0,
    "workerGroup": "us-east-1d",
    "workerId": "i-dummyworkerid",
    "version": 1
  },
  "exchange": "exchange/taskcluster-queue/v1/task-completed",
  "routingKey": "primary.UddybY6aTJqO1U4j2VVPDw.0.us-east-1d.i-0b76c31280ca40fae.aws-provisioner-v1.emulator-x86-kk.task-graph-scheduler.PmtjssXaS-K0tQMSp94iWQ._",
  "redelivered": false,
  "routes": [
    "treeherder.try.dummyrevision"
  ],
  "routing": {
    "routingKeyKind": "primary",
    "taskId": "5UMTRzgESFG3Bn8kCBwxxQ",
    "runId": "0",
    "workerGroup": "us-east-1d",
    "workerId": "i-dummyworkerid",
    "provisionerId": "aws-provisioner-v1",
    "workerType": "DUMMYWORKERTYPE",
    "schedulerId": "task-graph-scheduler",
    "taskGroupId": "DUMMYGROUPID",
    "reserved": "_"
  }
}`;

exports.completed = completed;
