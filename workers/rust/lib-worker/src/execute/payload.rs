use serde::Deserialize;

/// A valid Payload can be constructed from a JSON Value, carries no references, and is
/// thread-safe.  An ['Executor`] specifies a payload type, and this crate takes care of
/// constructing that type before beginning execution.  In most cases, simply deriving
/// [`serde::Deserialize`] for a struct is sufficient to implement this trait.
pub trait Payload: 'static + Sync + Send + Sized {
    fn from_value(value: serde_json::Value) -> Result<Self, anyhow::Error>;
}

impl<T: 'static + Sync + Send + Sized + for<'de> Deserialize<'de>> Payload for T {
    fn from_value(v: serde_json::Value) -> Result<Self, anyhow::Error> {
        Ok(serde_json::from_value(v)?)
    }
}
