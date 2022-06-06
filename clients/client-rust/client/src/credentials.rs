use crate::util::collect_scopes;
use anyhow::{anyhow, Context, Error};
use hmac_sha256::HMAC;
use serde::{Deserialize, Serialize};
use std::env;
use std::iter::{IntoIterator, Iterator};
use std::time::{Duration, SystemTime};

/// Credentials represents the set of credentials required to access protected
/// Taskcluster HTTP APIs.
#[derive(Debug, PartialEq, Clone, Serialize, Deserialize)]
pub struct Credentials {
    /// Client ID
    #[serde(rename = "clientId")]
    pub client_id: String,

    /// Access token
    #[serde(rename = "accessToken")]
    pub access_token: String,

    /// Certificate for temporary credentials
    pub certificate: Option<String>,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub(crate) struct Certificate {
    pub version: u32,
    pub scopes: Vec<String>,
    pub start: i64,
    pub expiry: i64,
    pub seed: String,
    pub signature: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub issuer: Option<String>,
}

fn gen_temp_access_token(perm_access_token: &str, seed: &str) -> String {
    let mut hash = HMAC::new(perm_access_token.as_bytes());
    hash.update(seed.as_bytes());
    base64::encode_config(hash.finalize(), base64::URL_SAFE_NO_PAD)
}

impl Credentials {
    /// Create a new Credentials object from environment variables:
    ///
    /// * `TASKCLUSTER_CLIENT_ID`
    /// * `TASKCLUSTER_ACCESS_TOKEN`
    /// * `TASKCLUSTER_CERTIFICATE` (optional)
    pub fn from_env() -> Result<Credentials, Error> {
        let client_id = env::var("TASKCLUSTER_CLIENT_ID").context("TASKCLUSTER_CLIENT_ID")?;
        let access_token =
            env::var("TASKCLUSTER_ACCESS_TOKEN").context("TASKCLUSTER_ACCESS_TOKEN")?;

        let certificate = match env::var("TASKCLUSTER_CERTIFICATE") {
            Err(err) => match err {
                env::VarError::NotPresent => None,
                _ => {
                    return Err(anyhow!(
                        "Cannot read environment variable 'TASKCLUSTER_CERTIFICATE': {}",
                        err
                    ))
                }
            },
            Ok(cert) if cert.is_empty() => None,
            Ok(cert) => Some(cert),
        };

        Ok(Credentials {
            client_id,
            access_token,
            certificate,
        })
    }

    /// Create a new Credentials object with clientId and accessToken
    ///
    /// Examples:
    ///
    /// ```
    /// # use taskcluster::Credentials;
    /// let _ = Credentials::new("my_client_id", "my_access_token");
    /// ```
    pub fn new<S1: Into<String>, S2: Into<String>>(client_id: S1, access_token: S2) -> Credentials {
        Credentials {
            client_id: client_id.into(),
            access_token: access_token.into(),
            certificate: None,
        }
    }

    /// Create a new Credentials object with clientId, accessToken, and certificate
    ///
    /// Examples:
    ///
    /// ```
    /// # use taskcluster::Credentials;
    /// let _ = Credentials::new_with_certificate("my_client_id", "my_access_token", "{}");
    /// ```
    pub fn new_with_certificate<S1, S2, S3>(
        client_id: S1,
        access_token: S2,
        certificate: S3,
    ) -> Credentials
    where
        S1: Into<String>,
        S2: Into<String>,
        S3: Into<String>,
    {
        Credentials {
            client_id: client_id.into(),
            access_token: access_token.into(),
            certificate: Some(certificate.into()),
        }
    }

    /// Generate temporary credentials from permanent credentials, valid for the given duration,
    /// starting immediately.  The temporary credentials' scopes must be a subset of the permanent
    /// credentials' scopes. The duration may not be more than 31 days. Any authorized scopes of
    /// the permanent credentials will be passed through as authorized scopes to the temporary
    /// credentials, but will not be restricted via the certificate.
    ///
    /// Note that the auth service already applies a 5 minute clock skew to the
    /// start and expiry times in
    /// https://github.com/taskcluster/taskcluster-auth/pull/117 so no clock skew is
    /// applied in this method, nor should be applied by the caller.
    ///
    /// See https://docs.taskcluster.net/docs/manual/design/apis/hawk/temporary-credentials
    pub fn create_named_temp_creds(
        &self,
        temp_client_id: &str,
        duration: Duration,
        scopes: impl IntoIterator<Item = impl AsRef<str>>,
    ) -> Result<Credentials, Error> {
        self.create_temp_creds_inner(Some(temp_client_id), duration, scopes)
    }

    /// Similar to `create_named_temp_creds`, but creating unnamed credentials.  This approach is
    /// still supported but users are encouraged to create named credentials when possible to
    /// support auditability.
    pub fn create_temp_creds(
        &self,
        duration: Duration,
        scopes: impl IntoIterator<Item = impl AsRef<str>>,
    ) -> Result<Credentials, Error> {
        self.create_temp_creds_inner(None, duration, scopes)
    }

    fn create_temp_creds_inner(
        &self,
        temp_client_id: Option<&str>,
        duration: Duration,
        scopes: impl IntoIterator<Item = impl AsRef<str>>,
    ) -> Result<Credentials, Error> {
        assert!(
            temp_client_id != Some(""),
            "if provided, temp_client_id must be non-empty"
        );
        if duration > Duration::from_secs(3600) * 24 * 31 {
            return Err(anyhow!("Duration must be at most 31 days"));
        }

        if self.certificate.is_some() {
            return Err(anyhow!(
                "Can only create temporary credentials from permanent credentials",
            ));
        }

        let start = SystemTime::now();
        let expiry = start + duration;

        let mut cert = Certificate {
            version: 1,
            scopes: collect_scopes(scopes),
            start: start
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_millis() as i64,
            expiry: expiry
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_millis() as i64,
            seed: slugid::v4() + &slugid::v4(),
            signature: String::new(),
            // include the issuer iff this is a named credential
            issuer: if temp_client_id.is_some() {
                Some(self.client_id.clone())
            } else {
                None
            },
        };

        cert.sign(&self.access_token, temp_client_id);

        let temp_access_token = gen_temp_access_token(&self.access_token, &cert.seed);

        Ok(Credentials {
            client_id: if let Some(id) = temp_client_id {
                id.to_owned()
            } else {
                self.client_id.clone()
            },
            access_token: temp_access_token,
            certificate: Some(serde_json::to_string(&cert)?),
        })
    }
}

impl Certificate {
    pub(crate) fn sign(&mut self, access_token: &str, temp_client_id: Option<&str>) {
        let mut lines = vec![format!("version:{}", self.version)];

        // include issuer and clientId if this is a temporary credential
        if let Some(ref issuer) = self.issuer {
            lines.extend_from_slice(&[
                format!(
                    "clientId:{}",
                    temp_client_id.expect("must have temp_client_id for named credentials")
                ),
                format!("issuer:{}", issuer),
            ]);
        }

        lines.extend_from_slice(&[
            format!("seed:{}", self.seed),
            format!("start:{}", self.start),
            format!("expiry:{}", self.expiry),
            String::from("scopes:"),
        ]);

        lines.extend_from_slice(
            self.scopes
                .clone()
                .into_iter()
                .collect::<Vec<String>>()
                .as_slice(),
        );

        let mut hash = HMAC::new(access_token.as_bytes());
        hash.update(lines.join("\n").as_bytes());
        self.signature = base64::encode(hash.finalize());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use lazy_static::lazy_static;
    use serde_json::{json, Value};
    use std::sync::{LockResult, Mutex, MutexGuard};
    use std::time;

    // environment is global to the process, so we need to ensure that only one test uses
    // it at a time.
    lazy_static! {
        static ref ENV_LOCK: Mutex<()> = Mutex::new(());
    }

    fn clear_env() -> LockResult<MutexGuard<'static, ()>> {
        let guard = ENV_LOCK.lock();
        for (key, _) in env::vars() {
            if key.starts_with("TASKCLUSTER_") {
                env::remove_var(key);
            }
        }
        guard
    }

    #[test]
    fn test_new() {
        let creds = Credentials::new("a-client", "a-token");
        assert_eq!(creds.client_id, "a-client");
        assert_eq!(creds.access_token, "a-token");
        assert_eq!(creds.certificate, None);
    }

    #[test]
    fn test_from_env() {
        let _guard = clear_env();
        env::set_var("TASKCLUSTER_CLIENT_ID", "a-client");
        env::set_var("TASKCLUSTER_ACCESS_TOKEN", "a-token");
        let creds = Credentials::from_env().unwrap();
        assert_eq!(creds.client_id, "a-client");
        assert_eq!(creds.access_token, "a-token");
        assert_eq!(creds.certificate, None);
    }

    #[test]
    fn test_from_env_missing() {
        let _guard = clear_env();
        env::set_var("TASKCLUSTER_CLIENT_ID", "a-client");
        // (no access token)
        assert!(Credentials::from_env().is_err());
    }

    #[test]
    fn test_from_json() {
        let v = json!({
            "clientId": "cli",
            "accessToken": "at",
        });
        let c: Credentials = serde_json::from_value(v).unwrap();
        assert_eq!(
            c,
            Credentials {
                client_id: "cli".to_string(),
                access_token: "at".to_string(),
                certificate: None,
            }
        );
    }

    #[test]
    fn test_from_json_cert() {
        let v = json!({
            "clientId": "cli",
            "accessToken": "at",
            "certificate": "{}",
        });
        let c: Credentials = serde_json::from_value(v).unwrap();
        assert_eq!(
            c,
            Credentials {
                client_id: "cli".to_string(),
                access_token: "at".to_string(),
                certificate: Some("{}".to_string()),
            }
        );
    }

    #[test]
    fn test_json_round_trip() {
        // note that the order of JSON properties is not defined in the string format,
        // so we cannot compare strings; instead we round-trip to a string and back
        // and compare the result.
        let c1 = Credentials {
            client_id: "cli".to_string(),
            access_token: "at".to_string(),
            certificate: Some("{}".to_string()),
        };
        let s = serde_json::to_string(&c1).unwrap();
        let c2: Credentials = serde_json::from_str(&s).unwrap();
        assert_eq!(c1, c2);
    }

    #[test]
    fn test_from_env_cert() {
        let _guard = clear_env();
        env::set_var("TASKCLUSTER_CLIENT_ID", "a-client");
        env::set_var("TASKCLUSTER_ACCESS_TOKEN", "a-token");
        env::set_var("TASKCLUSTER_CERTIFICATE", "cert");
        let creds = Credentials::from_env().unwrap();
        assert_eq!(creds.client_id, "a-client");
        assert_eq!(creds.access_token, "a-token");
        assert_eq!(creds.certificate, Some("cert".into()));
    }

    #[test]
    fn test_unnamed_temp_creds() {
        let creds = Credentials::new("a-client", "a-token");
        let temp = creds
            .create_temp_creds(time::Duration::from_secs(3600), vec!["scope1"])
            .unwrap();

        // unnamed, so client ID remains
        assert_eq!(temp.client_id, "a-client".to_owned());
        // ..but not the access token!
        assert!(temp.access_token != "a-token".to_owned());

        // check the cert's fields, noting that most aren't deterministic
        let cert = serde_json::from_str::<Value>(temp.certificate.unwrap().as_ref()).unwrap();
        assert_eq!(cert.get("version").unwrap(), &json!(1));
        assert!(cert.get("start").is_some());
        assert!(cert.get("expiry").is_some());
        assert!(cert.get("seed").is_some());
        assert!(cert.get("signature").is_some());
        assert!(cert.get("issuer").is_none());
    }

    #[test]
    fn test_unnamed_temp_creds_on_temp_creds() {
        let creds = Credentials::new_with_certificate("a-client", "a-token", "{}");
        assert!(creds
            .create_temp_creds(time::Duration::from_secs(3600), vec!["scope1"])
            .is_err());
    }

    #[test]
    fn test_unnamed_temp_creds_too_long_ttl() {
        let creds = Credentials::new("a-client", "a-token");
        assert!(creds
            .create_temp_creds(time::Duration::from_secs(360000000), vec!["scope1"])
            .is_err());
    }

    #[test]
    fn test_named_temp_creds() {
        let creds = Credentials::new("a-client", "a-token");
        let temp = creds
            .create_named_temp_creds("new-cred", time::Duration::from_secs(3600), vec!["scope1"])
            .unwrap();

        // updated client ID
        assert_eq!(temp.client_id, "new-cred".to_owned());
        // ..and a new access token
        assert!(temp.access_token != "a-token".to_owned());

        // check the cert's fields, noting that most aren't deterministic
        let cert = serde_json::from_str::<Value>(temp.certificate.unwrap().as_ref()).unwrap();
        assert_eq!(cert.get("version").unwrap(), &json!(1));
        assert!(cert.get("start").is_some());
        assert!(cert.get("expiry").is_some());
        assert!(cert.get("seed").is_some());
        assert!(cert.get("signature").is_some());
        assert_eq!(cert.get("issuer").unwrap(), &json!("a-client"));
    }

    #[test]
    fn test_named_temp_creds_on_temp_creds() {
        let creds = Credentials::new_with_certificate("a-client", "a-token", "{}");
        assert!(creds
            .create_named_temp_creds("new-cred", time::Duration::from_secs(3600), vec!["scope1"])
            .is_err());
    }
}
