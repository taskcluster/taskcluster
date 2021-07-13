use chrono::{prelude::*, Duration};
use serde::Deserialize;
use serde_json::json;
use std::collections::HashMap;

/// A Task, as read from the Queue API.  See that documentation for details of the fields.
#[derive(Deserialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub created: DateTime<Utc>,
    pub deadline: DateTime<Utc>,
    pub expires: DateTime<Utc>,
    pub dependencies: Vec<String>,
    pub metadata: TaskMetadata,
    pub priority: String,
    pub project_id: String,
    pub requires: String,
    pub retries: u32,
    pub routes: Vec<String>,
    pub scheduler_id: String,
    pub scopes: Vec<String>,
    pub tags: HashMap<String, String>,
    pub task_group_id: String,
    pub task_queue_id: String,
    pub extra: serde_json::Value,
    pub payload: serde_json::Value,
}

impl Task {
    /// Read a Task from a raw JSON value.
    pub fn from_json(json: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json)
    }

    /// Read a Task from a [`serde_json::Value`].
    pub fn from_value(json: serde_json::Value) -> Result<Self, serde_json::Error> {
        serde_json::from_value(json)
    }

    /// Get the payload, deserialized as a specific type
    pub fn payload<T: for<'de> serde::Deserialize<'de>>(&self) -> Result<T, serde_json::Error> {
        serde_json::from_value(self.payload.clone())
    }
}

impl Default for Task {
    fn default() -> Self {
        Self {
            created: Utc::now(),
            deadline: Utc::now() + Duration::days(1),
            expires: Utc::now() + Duration::days(2),
            dependencies: vec![],
            metadata: TaskMetadata {
                description: "test task".to_owned(),
                name: "test task".to_owned(),
                owner: "tester".to_owned(),
                source: "https://example.com".to_owned(),
            },
            priority: "normal".to_owned(),
            project_id: "none".to_owned(),
            requires: "all-complete".to_owned(),
            retries: 5,
            routes: vec![],
            scheduler_id: "-".to_owned(),
            scopes: vec![],
            tags: HashMap::new(),
            task_group_id: "R6ta4hSOR1izWgW3S9Fa5g".to_owned(),
            task_queue_id: "test/workers".to_owned(),
            extra: json!({}),
            payload: json!({}),
        }
    }
}

#[derive(Deserialize, Debug, PartialEq)]
pub struct TaskMetadata {
    pub description: String,
    pub name: String,
    pub owner: String,
    pub source: String,
}

#[cfg(test)]
mod test {
    use super::*;
    use serde_json::json;

    #[test]
    fn deserialize() {
        let v = json!({
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
        });

        let task = Task::from_value(v).unwrap();
        assert_eq!(&task.task_queue_id, "aa/bb");
        assert_eq!(&task.scheduler_id, "taskcluster-ui");
        assert_eq!(&task.project_id, "none");
        assert_eq!(&task.task_group_id, "NUfSprsfR-mhjAy1Ax2DTA");
        assert_eq!(task.dependencies, vec!["eAQbqpyUS8GH-y-gPy8MHw".to_owned()]);
        assert_eq!(&task.requires, "all-completed");
        assert_eq!(task.routes, vec!["a.b.c".to_owned()]);
        assert_eq!(&task.priority, "lowest");
        assert_eq!(task.retries, 5);
        assert_eq!(
            task.created,
            Utc.ymd(2021, 5, 24).and_hms_micro(14, 31, 37, 253_000)
        );
        assert_eq!(
            task.deadline,
            Utc.ymd(2021, 5, 24).and_hms_micro(17, 31, 37, 253_000)
        );
        assert_eq!(
            task.expires,
            Utc.ymd(2022, 5, 24).and_hms_micro(14, 31, 37, 253_000)
        );
        assert_eq!(task.scopes, vec!["micro".to_owned()]);
        assert_eq!(task.payload, json!({"pay": "load"}),);
        assert_eq!(&task.metadata.name, "aa/b test task");
        assert_eq!(&task.metadata.owner, "name@example.com");
        assert_eq!(
            &task.metadata.source,
            "https://dustin.taskcluster-dev.net/tasks/create"
        );
        assert_eq!(&task.metadata.description, "An **example** task");
        assert_eq!(
            task.tags,
            vec![("you're".to_owned(), "it".to_owned())]
                .drain(..)
                .collect::<HashMap<String, String>>()
        );
        assert_eq!(task.extra, json!({"side": "salad"}),);

        #[derive(Debug, Deserialize, PartialEq)]
        struct Payload {
            pay: String,
        }

        let payload: Payload = task.payload().unwrap();
        assert_eq!(
            payload,
            Payload {
                pay: "load".to_string()
            }
        );
    }
}
