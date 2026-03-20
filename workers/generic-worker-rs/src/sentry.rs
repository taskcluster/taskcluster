//! Sentry crash reporting.
//!
//! Reports panics/crashes to Sentry by obtaining a DSN from the Taskcluster
//! Auth service. This is a faithful port of the Go `sentry.go` module.

use std::collections::HashMap;

use crate::config::{Config, Credentials};

/// Report a crash to Sentry.
///
/// Obtains a Sentry DSN from the Auth service using the configured
/// `sentry_project`, then initialises a Sentry client and captures the
/// panic value. If `sentry_project` is empty, logs a message and returns.
pub fn report_crash_to_sentry(
    panic_info: &str,
    config: &Config,
    debug_info: &HashMap<String, String>,
) {
    if config.sentry_project.is_empty() {
        tracing::info!("No sentry project defined, not reporting to sentry");
        return;
    }

    // Fetch the Sentry DSN from the Auth service
    let dsn = match fetch_sentry_dsn(config) {
        Ok(dsn) => dsn,
        Err(e) => {
            tracing::warn!("Could not get sentry DSN: {e}");
            return;
        }
    };

    // Initialise the Sentry client with the secret DSN
    let _guard = sentry::init(sentry::ClientOptions {
        dsn: match dsn.parse() {
            Ok(dsn) => Some(dsn),
            Err(e) => {
                tracing::error!("Could not parse sentry DSN: {e}");
                return;
            }
        },
        ..Default::default()
    });

    // Build a Sentry event with the panic info and debug tags
    let mut event = sentry::protocol::Event::new();
    event.message = Some(panic_info.to_string());
    event.level = sentry::Level::Fatal;
    for (k, v) in debug_info {
        event.tags.insert(k.clone(), v.clone());
    }

    sentry::capture_event(event);

    // Flush to ensure the event is sent before the guard drops
    if let Some(client) = sentry::Hub::current().client() {
        client.flush(Some(std::time::Duration::from_secs(5)));
    }
}

/// Fetch the secret Sentry DSN from the Taskcluster Auth service.
fn fetch_sentry_dsn(config: &Config) -> Result<String, anyhow::Error> {
    let credentials = config.credentials();
    let url = format!(
        "{}/api/auth/v1/sentry/{}/dsn",
        config.root_url, config.sentry_project
    );
    let dsn_response = fetch_sentry_dsn_http(&url, &credentials)?;
    Ok(dsn_response)
}

/// Make the HTTP request to the Auth service to obtain the Sentry DSN.
///
/// Uses a synchronous (blocking) HTTP call because crash reporting typically
/// happens outside of the async runtime (e.g. in a panic hook).
fn fetch_sentry_dsn_http(url: &str, credentials: &Credentials) -> Result<String, anyhow::Error> {
    use hawk::{Credentials as HawkCredentials, Key, RequestBuilder, SHA256};
    use url::Url;

    let parsed_url = Url::parse(url)?;
    let hawk_credentials = HawkCredentials {
        id: credentials.client_id.clone(),
        key: Key::new(credentials.access_token.as_bytes(), SHA256)
            .map_err(|e| anyhow::anyhow!("Failed to create Hawk key: {:?}", e))?,
    };
    let request = RequestBuilder::from_url("GET", &parsed_url)
        .map_err(|e| anyhow::anyhow!("Failed to build Hawk request: {:?}", e))?
        .request();
    let header = request
        .make_header(&hawk_credentials)
        .map_err(|e| anyhow::anyhow!("Failed to make Hawk header: {:?}", e))?;
    let auth_header = format!("Hawk {}", header);

    // Use reqwest blocking client since we may be outside the async runtime
    let client = reqwest::blocking::Client::new();
    let response = client
        .get(url)
        .header("Authorization", auth_header)
        .send()?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().unwrap_or_default();
        anyhow::bail!("SentryDSN request failed with status {status}: {body}");
    }

    #[derive(serde::Deserialize)]
    struct Dsn {
        secret: String,
    }
    #[derive(serde::Deserialize)]
    struct SentryDsnResponse {
        dsn: Dsn,
    }

    let resp: SentryDsnResponse = response.json()?;
    Ok(resp.dsn.secret)
}
