use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fmt;

/// A runner / worker protocol message.
#[allow(dead_code)]
#[derive(Deserialize, Serialize, Clone, Debug, PartialEq)]
#[serde(tag = "type")]
#[serde(rename_all = "kebab-case")]
pub enum Message {
    Welcome {
        capabilities: Vec<String>,
    },
    Hello {
        capabilities: Vec<String>,
    },
    ErrorReport {
        kind: String,
        title: String,
        description: String,
        extra: Value,
    },
    Shutdown,
    GracefulTermination {
        #[serde(rename = "finish-tasks")]
        finish_tasks: bool,
    },
    Log {
        body: Value,
    },
    NewCredentials {
        #[serde(rename = "client-id")]
        client_id: String,
        #[serde(rename = "access-token")]
        access_token: String,
        certificate: Option<String>,
    },

    /// Anything not in the form `~{..}` or that doesn't deserialize
    #[serde(skip)]
    NonMessage(String),
}

impl From<String> for Message {
    fn from(line: String) -> Message {
        Message::from(line.as_ref())
    }
}

impl From<&str> for Message {
    fn from(line: &str) -> Message {
        if !line.starts_with("~{") || !line.ends_with("}") {
            return Message::NonMessage(line.to_owned());
        }
        match serde_json::from_str(&line[1..]) {
            Ok(msg) => msg,
            Err(e) => {
                dbg!(e);
                Message::NonMessage(line.to_owned())
            }
        }
    }
}

impl fmt::Display for Message {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Message::NonMessage(s) => write!(f, "{}", s),
            // everything but NoMessage is serializable, so unwrap is OK
            _ => write!(f, "~{}", serde_json::to_string(&self).unwrap()),
        }
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use serde_json::json;

    #[test]
    fn non_message() {
        assert_eq!(
            Message::from("not a JSON thing"),
            Message::NonMessage("not a JSON thing".into())
        );
    }

    #[test]
    fn non_message_json_formatting() {
        assert_eq!(
            Message::from("~{not actually json}"),
            Message::NonMessage("~{not actually json}".into())
        );
    }

    #[test]
    fn non_message_no_type() {
        assert_eq!(
            Message::from(r#"~{"foo": "bar"}"#),
            Message::NonMessage(r#"~{"foo": "bar"}"#.into())
        );
    }

    #[test]
    fn non_message_unknown_type() {
        assert_eq!(
            Message::from(r#"~{"type": "nosuch"}"#),
            Message::NonMessage(r#"~{"type": "nosuch"}"#.into())
        );
    }

    fn round_trip(json: &str, expected: Message) {
        let original = Message::from(json);
        assert_eq!(original, expected);
        let line = format!("~{}", serde_json::to_string(&original).unwrap());
        let round_trip = Message::from(line);
        assert_eq!(round_trip, original);
    }

    #[test]
    fn hello() {
        round_trip(
            r#"~{"type": "hello", "capabilities": ["x", "y"]}"#,
            Message::Hello {
                capabilities: vec!["x".into(), "y".into()],
            },
        );
    }

    #[test]
    fn welcome() {
        round_trip(
            r#"~{"type": "welcome", "capabilities": ["x", "y"]}"#,
            Message::Welcome {
                capabilities: vec!["x".into(), "y".into()],
            },
        );
    }

    #[test]
    fn error_report() {
        round_trip(
            r#"~{"type": "error-report", "kind": "critical", "title": "uhoh", "description": "this is bad", "extra": {}}"#,
            Message::ErrorReport {
                kind: "critical".into(),
                title: "uhoh".into(),
                description: "this is bad".into(),
                extra: json!({}),
            },
        );
    }

    #[test]
    fn shutdown() {
        round_trip(r#"~{"type": "shutdown"}"#, Message::Shutdown);
    }

    #[test]
    fn graceful_termination() {
        round_trip(
            r#"~{"type": "graceful-termination", "finish-tasks": true}"#,
            Message::GracefulTermination { finish_tasks: true },
        );
    }

    #[test]
    fn log() {
        round_trip(
            r#"~{"type": "log", "body": {"foo": "bar"}}"#,
            Message::Log {
                body: json!({"foo": "bar"}),
            },
        );
    }

    #[test]
    fn new_credentials() {
        round_trip(
            r#"~{"type": "new-credentials", "client-id": "cli", "access-token": "at", "certificate": "cert"}"#,
            Message::NewCredentials {
                client_id: "cli".into(),
                access_token: "at".into(),
                certificate: Some("cert".into()),
            },
        );
    }

    #[test]
    fn new_credentials_no_cert() {
        round_trip(
            r#"~{"type": "new-credentials", "client-id": "cli", "access-token": "at"}"#,
            Message::NewCredentials {
                client_id: "cli".into(),
                access_token: "at".into(),
                certificate: None,
            },
        );
    }
}
