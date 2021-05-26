use serde_json::{json, Value};
use slog::{o, Drain, Logger};

/// Create a Logger for use in tests
pub(crate) fn test_logger() -> Logger {
    let decorator = slog_term::PlainSyncDecorator::new(slog_term::TestStdoutWriter);
    let drain = slog_term::FullFormat::new(decorator).build().fuse();

    Logger::root(drain, o!())
}

/// Create a full task definition that can deserialize to a Task.
pub(crate) fn test_task_json() -> Value {
    json!({
        "provisionerId": "aa", // ignored
        "workerType": "bb", // ignored
        "taskQueueId": "aa/bb",
        "schedulerId": "taskcluster-ui",
        "projectId": "none",
        "taskGroupId": "NUfSprsfR-mhjAy1Ax2DTA",
        "dependencies": [
            "eAQbqpyUS8GH-y-gPy8MHw",
        ],
        "requires": "all-completed",
        "routes": [
            "a.b.c",
        ],
        "priority": "lowest",
        "retries": 5,
        "created": "2021-05-24T14:31:37.253Z",
        "deadline": "2021-05-24T17:31:37.253Z",
        "expires": "2022-05-24T14:31:37.253Z",
        "scopes": [
            "micro",
        ],
        "payload": {
            "pay": "load",
        },
        "metadata": {
            "name": "aa/b test task",
            "owner": "name@example.com",
            "source": "https://dustin.taskcluster-dev.net/tasks/create",
            "description": "An **example** task"
        },
        "tags": {
            "you're": "it",
        },
        "extra": {
            "side": "salad",
        }
    })
}
