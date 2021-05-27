use crate::workerproto::Message;
use std::collections::HashSet;
use std::str::FromStr;
use std::string::ToString;
use strum_macros::EnumString;

/// Capabilities
#[derive(Debug, Copy, Clone, Eq, PartialEq, Hash, EnumString, strum_macros::ToString)]
pub enum Capability {
    #[strum(serialize = "error-report")]
    ErrorReport,
    #[strum(serialize = "shutdown")]
    Shutdown,
    #[strum(serialize = "graceful-termination")]
    GracefulTermination,
    #[strum(serialize = "log")]
    Log,
    #[strum(serialize = "new-credentials")]
    NewCredentials,
}

pub struct Capabilities(HashSet<Capability>);

impl Capabilities {
    /// Decipher capabilities from a Hello or Welcome message.  Any other
    /// kind of message will panic.  Any unknown capabilities will be ignored.
    pub fn from_message(msg: &Message) -> Self {
        let mut caps = Capabilities(HashSet::new());
        let caps_vec = match msg {
            Message::Hello { ref capabilities } => capabilities,
            Message::Welcome { ref capabilities } => capabilities,
            _ => panic!("Message is not Hello or Welcome"),
        };

        for cap_str in caps_vec {
            if let Ok(cap) = Capability::from_str(cap_str) {
                caps.0.insert(cap);
            }
        }
        caps
    }

    /// Create a new Capabilities object with the given capabilities.
    pub fn from_capabilities(capabilities: &[Capability]) -> Self {
        Capabilities(capabilities.iter().map(|c| c.to_owned()).collect())
    }

    /// Create a Hello message containing these capabilities
    pub fn hello_message(&self) -> Message {
        Message::Hello {
            capabilities: self.0.iter().map(|c| c.to_string()).collect(),
        }
    }

    /// Determine whether this capability is present.
    pub fn capable(&self, cap: Capability) -> bool {
        self.0.contains(&cap)
    }

    /// Intersect this set of capabilities with another
    pub fn intersection(&self, other: &Capabilities) -> Self {
        Self(self.0.intersection(&other.0).cloned().collect())
    }
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn test_capability_to_string() {
        assert_eq!(
            Capability::ErrorReport.to_string(),
            "error-report".to_owned()
        );
    }

    #[test]
    fn test_capability_from_str() {
        assert_eq!(
            Capability::from_str("error-report").unwrap(),
            Capability::ErrorReport,
        );
    }

    #[test]
    fn test_capability_from_unknown() {
        assert!(Capability::from_str("no-such").is_err());
    }

    #[test]
    fn test_capabilities_from_message() {
        let msg = Message::Hello {
            capabilities: vec!["log".into(), "shutdown".into()],
        };
        let caps = Capabilities::from_message(&msg);
        assert!(caps.capable(Capability::Log));
        assert!(caps.capable(Capability::Shutdown));
        assert!(!caps.capable(Capability::GracefulTermination));
    }

    #[test]
    fn test_capabilities_hello() {
        let caps = Capabilities::from_capabilities(&[Capability::Log]);
        assert_eq!(
            caps.hello_message(),
            Message::Hello {
                capabilities: vec!["log".into()]
            }
        );
    }

    #[test]
    fn test_capabilities_from_slice() {
        let caps = Capabilities::from_capabilities(&[Capability::Log, Capability::Shutdown]);
        assert!(caps.capable(Capability::Log));
        assert!(caps.capable(Capability::Shutdown));
        assert!(!caps.capable(Capability::GracefulTermination));
    }

    #[test]
    fn test_intersection() {
        let caps1 = Capabilities::from_capabilities(&[Capability::Log, Capability::Shutdown]);
        let caps2 =
            Capabilities::from_capabilities(&[Capability::ErrorReport, Capability::Shutdown]);
        let caps = caps1.intersection(&caps2);
        assert!(!caps.capable(Capability::Log));
        assert!(caps.capable(Capability::Shutdown));
        assert!(!caps.capable(Capability::ErrorReport));
    }
}
