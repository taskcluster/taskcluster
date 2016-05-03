let statusMessage = `
{
    "status": {
        "taskId": "5UMTRzgESFG3Bn8kCBwxxQ",
        "provisionerId": "aws-provisioner-v1",
        "workerType": "b2gtest-emulator",
        "schedulerId": "task-graph-scheduler",
        "taskGroupId": "DUMMY_TASK_GROUP_ID",
        "deadline": "2016-04-16T18:12:25.211Z",
        "expires": "2017-04-16T18:12:25.211Z",
        "retriesLeft": 5,
        "state": "pending",
        "runs": [
            {
                "runId": 0,
                "state": "pending",
                "reasonCreated": "scheduled",
                "scheduled": "2016-04-15T19:15:00.497Z"
            }
        ]
    },
    "runId": 0,
    "version": 1
}`;

exports.statusMessage = statusMessage;
