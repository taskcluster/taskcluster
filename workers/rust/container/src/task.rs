use serde::Deserialize;
use taskcluster_lib_worker::executor;

/// A container-worker payload
#[derive(Debug, Deserialize)]
pub(crate) struct Payload {
    pub(crate) image: String,
    pub(crate) command: Vec<String>,
}

impl executor::Payload for Payload {
    fn from_value(v: serde_json::Value) -> Result<Self, anyhow::Error> {
        Ok(serde_json::from_value(v)?)
    }
}
