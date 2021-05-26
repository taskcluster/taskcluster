use crate::task::Task;
use serde::Deserialize;
use std::convert::TryFrom;
use taskcluster::Credentials;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TaskStatusJson {
    task_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TaskClaimJson {
    status: TaskStatusJson,
    task: Task,
    credentials: Credentials,
    run_id: u32,
}

/// Deserialized about a single task as returned from `queue.claimWork`
#[derive(Debug)]
pub(crate) struct TaskClaim {
    pub task_id: String,
    pub run_id: u32,
    /// The task definition
    pub task: Task,
    /// The task credentials, to be used for reclaiming, artifacts, and so on.
    pub credentials: Credentials,
}

impl TryFrom<serde_json::Value> for TaskClaim {
    type Error = serde_json::Error;

    fn try_from(value: serde_json::Value) -> Result<TaskClaim, serde_json::Error> {
        let tc: TaskClaimJson = serde_json::from_value(value)?;
        Ok(TaskClaim {
            task_id: tc.status.task_id,
            task: tc.task,
            credentials: tc.credentials,
            run_id: tc.run_id,
        })
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::test::test_task_json;
    use serde_json::json;

    #[test]
    fn deserialize() {
        let input = json!({
            "status": {
                "taskId": "tid"
            },
            "task": test_task_json(),
            "credentials": {
                "clientId": "cli",
                "accessToken": "at",
                "certificate": "{..}"
            },
            "runId": 10
        });

        let tc = TaskClaim::try_from(input).unwrap();
        assert_eq!(tc.task_id, "tid");
        assert_eq!(tc.run_id, 10);
        assert_eq!(tc.credentials.client_id, "cli");
        assert_eq!(tc.task.task_queue_id, "aa/bb");
    }
}
