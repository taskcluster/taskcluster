use anyhow::Result;
use reqwest::StatusCode;
use serde_json::{json, Value};
use std::env;
use std::time::Duration;
use taskcluster::{err_status_code, Auth, ClientBuilder, Credentials};
use tokio;

/// Return the TASKCLUSTER_ROOT_URL, or None if the test should be skipped,
/// or panic if the NO_TEST_SKIP is set and the env var is not.
fn get_root_url() -> Option<String> {
    match env::var("TASKCLUSTER_ROOT_URL") {
        Ok(v) => Some(v),
        Err(_) => match env::var("NO_TEST_SKIP") {
            Ok(_) => panic!("NO_TEST_SKIP is set but TASKCLUSTER_ROOT_URL is not!"),
            Err(_) => None,
        },
    }
}

/// Call the ping endpoint directly
#[tokio::test]
async fn test_auth_ping() -> Result<()> {
    if let Some(root_url) = get_root_url() {
        let auth = Auth::new(ClientBuilder::new(&root_url))?;
        auth.ping().await?;
    }
    Ok(())
}

/// Generate a simple URL for the ping endpoint and call it
#[tokio::test]
async fn test_auth_unsigned_ping_url() -> Result<()> {
    if let Some(root_url) = get_root_url() {
        let auth = Auth::new(ClientBuilder::new(&root_url))?;
        let url = auth.ping_url()?;

        let body: Value = reqwest::get(&url).await?.json().await?;
        assert_eq!(body.get("alive"), Some(&json!(true)));
    }
    Ok(())
}

/// Test that a 404 is treated as an error
#[tokio::test]
async fn test_no_such_client() -> Result<()> {
    if let Some(root_url) = get_root_url() {
        let auth = Auth::new(ClientBuilder::new(&root_url))?;
        let res = auth.client("no/such/client/exists").await;
        assert_eq!(
            err_status_code(&res.err().unwrap()),
            Some(StatusCode::NOT_FOUND)
        );
    }
    Ok(())
}

/// Test that a POST request with no payload doesn't give a 411 (#4890).
#[tokio::test]
async fn test_empty_post() -> Result<()> {
    if let Some(root_url) = get_root_url() {
        let auth = Auth::new(ClientBuilder::new(&root_url))?;
        let res = auth.resetAccessToken("no/such/client/for/rust/tests").await;
        let status_code = err_status_code(&res.err().unwrap());

        // if we had no credentials, this should be FORBIDDEN, but in case the credentials were
        // valid it will return 404.  Anything else is not good!
        if status_code != Some(StatusCode::NOT_FOUND) && status_code != Some(StatusCode::FORBIDDEN)
        {
            panic!("Got unexpected status code {:?}", status_code);
        }
    }
    Ok(())
}

/// Test a call with a query
#[tokio::test]
async fn test_auth_list_clients_paginated() -> Result<()> {
    if let Some(root_url) = get_root_url() {
        let auth = Auth::new(ClientBuilder::new(&root_url))?;
        let mut continuation_token: Option<String> = None;
        let limit = Some("2");
        let mut saw_root = false;

        loop {
            let res = auth
                .listClients(None, continuation_token.as_deref(), limit)
                .await?;
            for client in res.get("clients").unwrap().as_array().unwrap() {
                if client.get("clientId").unwrap().as_str().unwrap() == "static/taskcluster/root" {
                    saw_root = true;
                }
            }
            if let Some(v) = res.get("continuationToken") {
                continuation_token = Some(v.as_str().unwrap().to_owned());
            } else {
                break;
            }
        }
        // the root clientId should exist in any deployment.
        assert!(saw_root);
    }

    Ok(())
}

/// Test unsigned url generation with a query
#[tokio::test]
async fn test_auth_list_clients_unsigned_url() -> Result<()> {
    if let Some(root_url) = get_root_url() {
        let auth = Auth::new(ClientBuilder::new(&root_url))?;

        let url = auth.listClients_url(Some("static/"), None, None)?;
        let body: Value = reqwest::get(&url).await?.json().await?;

        // just check it returns an object with a `clients` property; the
        // rest is not relevant to url generation
        assert!(body.get("clients").is_some());
    }

    Ok(())
}

/// Test signed url generation
#[tokio::test]
async fn test_auth_signed_url() -> Result<()> {
    let auth = if let Some(root_url) = get_root_url() {
        let creds = Credentials::new("tester", "no-secret");
        Auth::new(ClientBuilder::new(&root_url).credentials(creds))?
    } else {
        return Ok(());
    };

    // check that an unsigned call fails..
    let url = auth.testAuthenticateGet_url()?;
    let res = reqwest::get(&url).await?;
    assert_eq!(res.status(), reqwest::StatusCode::FORBIDDEN);

    // ..but a signed call succeeds
    let url = auth.testAuthenticateGet_signed_url(Duration::from_secs(10))?;
    let res = reqwest::get(&url).await?;
    assert_eq!(res.status(), reqwest::StatusCode::OK);

    Ok(())
}

/// Test authenticated call with a body payload (verifying payload hashing)
#[tokio::test]
async fn test_auth_creds_with_body() -> Result<()> {
    let auth = if let Some(root_url) = get_root_url() {
        let creds = Credentials::new("tester", "no-secret");
        Auth::new(ClientBuilder::new(&root_url).credentials(creds))?
    } else {
        return Ok(());
    };

    let res = auth
        .testAuthenticate(&json!({
            "clientScopes": ["test:authenticate"],
            "requiredScopes": ["test:authenticate"],
        }))
        .await?;
    assert_eq!(res.get("clientId"), Some(&json!("tester")));

    Ok(())
}

/// Test authenticated call using unnamed temporary credentials
#[tokio::test]
async fn test_auth_unnamed_temp_creds() -> Result<()> {
    let creds = Credentials::new("tester", "no-secret");
    let creds = creds.create_temp_creds(Duration::from_secs(3600), vec!["test:authenticate"])?;
    let auth = if let Some(root_url) = get_root_url() {
        Auth::new(ClientBuilder::new(&root_url).credentials(creds))?
    } else {
        return Ok(());
    };

    let res = auth
        .testAuthenticate(&json!({
            "clientScopes": ["test:authenticate"],
            "requiredScopes": ["test:authenticate"],
        }))
        .await?;
    assert_eq!(res.get("clientId"), Some(&json!("tester")));

    Ok(())
}

/// Test signed url using unnamed temporary credentials
#[tokio::test]
async fn test_signed_url_unnamed_temp_creds() -> Result<()> {
    let creds = Credentials::new("tester", "no-secret");
    let creds =
        creds.create_temp_creds(Duration::from_secs(3600), vec!["test:authenticate-get"])?;
    let auth = if let Some(root_url) = get_root_url() {
        Auth::new(ClientBuilder::new(&root_url).credentials(creds))?
    } else {
        return Ok(());
    };

    let url = auth.testAuthenticateGet_signed_url(Duration::from_secs(10))?;
    let res = reqwest::get(&url).await?;
    assert_eq!(res.status(), reqwest::StatusCode::OK);

    Ok(())
}

/// Test authenticated call using authorizedScopes
#[tokio::test]
async fn test_auth_authorized_scopes() -> Result<()> {
    let creds = Credentials::new("tester", "no-secret");
    let auth = if let Some(root_url) = get_root_url() {
        Auth::new(
            ClientBuilder::new(&root_url)
                .authorized_scopes(vec!["test:authenticate"])
                .credentials(creds),
        )?
    } else {
        return Ok(());
    };

    // this one should succeed
    auth.testAuthenticate(&json!({
        "clientScopes": ["test:authenticate"],
        "requiredScopes": ["test:authenticate"],
    }))
    .await?;

    // but this should fail because authorizedScopes does not include "test:2"
    let err = auth
        .testAuthenticate(&json!({
            "clientScopes": ["test:authenticate", "test:2"],
            "requiredScopes": ["test:authenticate", "test:2"],
        }))
        .await
        .unwrap_err();

    assert_eq!(err_status_code(&err), Some(StatusCode::FORBIDDEN));

    Ok(())
}

/// Test authenticated call using named temporary credentials
#[tokio::test]
async fn test_auth_named_temp_creds() -> Result<()> {
    let creds = Credentials::new("tester", "no-secret");
    let creds = creds.create_named_temp_creds(
        "newcred",
        Duration::from_secs(3600),
        vec!["test:authenticate"],
    )?;
    let auth = if let Some(root_url) = get_root_url() {
        Auth::new(ClientBuilder::new(&root_url).credentials(creds))?
    } else {
        return Ok(());
    };

    let res = auth
        .testAuthenticate(&json!({
            "clientScopes": ["test:authenticate", "auth:create-client:newcred"],
            "requiredScopes": ["test:authenticate"],
        }))
        .await?;
    assert_eq!(res.get("clientId"), Some(&json!("newcred")));

    Ok(())
}

/// Test authenticated call using named temporary credentials and authorized scopes
#[tokio::test]
async fn test_auth_named_temp_creds_authorized_scopes() -> Result<()> {
    let creds = Credentials::new("tester", "no-secret");
    let creds = creds.create_named_temp_creds(
        "newcred",
        Duration::from_secs(3600),
        vec!["test:authenticate"],
    )?;
    let auth = if let Some(root_url) = get_root_url() {
        Auth::new(
            ClientBuilder::new(&root_url)
                .authorized_scopes(vec!["test:authenticate"])
                .credentials(creds),
        )?
    } else {
        return Ok(());
    };

    auth.testAuthenticate(&json!({
        "clientScopes": ["test:authenticate", "auth:create-client:newcred"],
        "requiredScopes": ["test:authenticate"],
    }))
    .await?;

    // this should fail because authorizedScopes does not include "test:2"
    let err = auth
        .testAuthenticate(&json!({
            "clientScopes": ["test:authenticate", "test:2", "auth:create-client:newcred"],
            "requiredScopes": ["test:authenticate", "test:2"],
        }))
        .await
        .unwrap_err();

    assert_eq!(err_status_code(&err), Some(StatusCode::FORBIDDEN));
    Ok(())
}

/// Test signed url using named temporary credentials
#[tokio::test]
async fn test_signed_url_named_temp_creds() -> Result<()> {
    let creds = Credentials::new("tester", "no-secret");
    let creds = creds.create_named_temp_creds(
        "test:creds",
        Duration::from_secs(3600),
        vec!["test:authenticate-get"],
    )?;
    let auth = if let Some(root_url) = get_root_url() {
        Auth::new(ClientBuilder::new(&root_url).credentials(creds))?
    } else {
        return Ok(());
    };

    let url = auth.testAuthenticateGet_signed_url(Duration::from_secs(10))?;
    let res = reqwest::get(&url).await?;
    assert_eq!(res.status(), reqwest::StatusCode::OK);

    Ok(())
}

/// Test an un-authenticated call with input and output bodies
#[tokio::test]
async fn test_auth_expand_scopes() -> Result<()> {
    if let Some(root_url) = get_root_url() {
        let auth = Auth::new(ClientBuilder::new(&root_url))?;
        let mut saw_scope = false;

        let res = auth
            .expandScopes(&json!({"scopes": ["assume:abc"]}))
            .await?;
        for scope in res.get("scopes").unwrap().as_array().unwrap() {
            if scope.as_str().unwrap() == "assume:abc" {
                saw_scope = true;
            }
        }
        // expansion always includes the input scopes, so this should exist
        assert!(saw_scope);
    }

    Ok(())
}
