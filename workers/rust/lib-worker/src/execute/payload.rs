/// A valid Payload can be constructed from a JSON Value, carries no references, and is
/// thread-safe.  An ['Executor`] specifies a payload type, and this crate takes care
/// of constructing that type before beginning execution.
pub trait Payload: 'static + Sync + Send + Sized {
    fn from_value(value: serde_json::Value) -> Result<Self, anyhow::Error>;
}

// TODO: blanket impl for serde::Deserialize
