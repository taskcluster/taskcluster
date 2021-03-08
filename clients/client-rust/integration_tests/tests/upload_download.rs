use anyhow::Result;
use ring::rand::{SecureRandom, SystemRandom};
use std::env;
use std::io::SeekFrom;
use taskcluster::chrono::{Duration, Utc};
use taskcluster::{ClientBuilder, Credentials, Object, Retry};
use tempfile::tempfile;
use tokio::fs::File;
use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt};

use taskcluster_download::{download_to_buf, download_to_file, download_to_vec};
use taskcluster_upload::{upload_from_buf, upload_from_file};

/// Return a client built with TC credentials from the environment, or panic if the NO_TEST_SKIP is
/// set and the env vars are not set.  The client is configured with authorized_scopes containing
/// the scopes required for these tests.  If creating a new client for these tests, consult the
/// scopes in the function body.
fn get_client() -> Option<ClientBuilder> {
    let (creds, root_url) = if let (Ok(v), Ok(_), Ok(_)) = (
        env::var("TASKCLUSTER_ROOT_URL"),
        env::var("TASKCLUSTER_CLIENT_ID"),
        env::var("TASKCLUSTER_ACCESS_TOKEN"),
    ) {
        (
            Credentials::from_env().expect("parsing credentials from environment"),
            v,
        )
    } else {
        match env::var("NO_TEST_SKIP") {
            Ok(_) => panic!(
                "NO_TEST_SKIP is set but TASKCLUSTER_{ROOT_URL,CLIENT_ID,ACCESS_TOKEN} are not!"
            ),
            Err(_) => return None,
        };
    };

    let required_scopes = vec![
        "object:upload:taskcluster:taskcluster/test/client-rs/*",
        "object:download:taskcluster/test/client-rs/*",
    ];

    Some(
        ClientBuilder::new(&root_url)
            .credentials(creds)
            .authorized_scopes(required_scopes),
    )
}

/// Test uploading a small bit of data.
#[tokio::test]
async fn test_small_upload() -> Result<()> {
    if let Some(client) = get_client() {
        let name = format!("taskcluster/test/client-rs/{}", slugid::v4());
        let svc = Object::new(client)?;
        let data = b"hello, world";
        let retry = Retry::default();

        upload_from_buf(
            "taskcluster",
            &name,
            "text/plain",
            &(Utc::now() + Duration::hours(1)),
            data,
            &Retry::default(),
            &svc,
        )
        .await?;

        let mut buf = [0u8; 128];
        let (bufslice, content_type) = download_to_buf(&name, &retry, &svc, &mut buf).await?;

        assert_eq!(&bufslice, &data);
        assert_eq!(&content_type, "text/plain");
    }

    Ok(())
}

/// Test uploading a large chunk of data (larger than the 8k allowed for data-inline)
#[tokio::test]
async fn test_large_upload() -> Result<()> {
    if let Some(client) = get_client() {
        let mut data = vec![1u8; 10000];
        SystemRandom::new().fill(&mut data).unwrap();
        let name = format!("taskcluster/test/client-rs/{}", slugid::v4());
        let svc = Object::new(client)?;
        let retry = Retry::default();

        upload_from_buf(
            "taskcluster",
            &name,
            "application/random",
            &(Utc::now() + Duration::hours(1)),
            &data,
            &Retry::default(),
            &svc,
        )
        .await?;

        let (res, content_type) = download_to_vec(&name, &retry, &svc).await?;
        assert_eq!(&res, &data);
        assert_eq!(&content_type, "application/random");
    }

    Ok(())
}

/// Test uploading a large chunk of data (larger than the 8k allowed for data-inline)
#[tokio::test]
async fn test_file_upload() -> Result<()> {
    if let Some(client) = get_client() {
        let mut data = vec![1u8; 10000];
        SystemRandom::new().fill(&mut data).unwrap();
        let mut file: File = tempfile()?.into();
        let retry = Retry::default();

        file.write_all(&data).await?;
        file.flush().await?;

        let name = format!("taskcluster/test/client-rs/{}", slugid::v4());
        let svc = Object::new(client)?;

        upload_from_file(
            "taskcluster",
            &name,
            "binary/random",
            &(Utc::now() + Duration::hours(1)),
            file,
            &Retry::default(),
            &svc,
        )
        .await?;

        let (mut file, content_type) =
            download_to_file(&name, &retry, &svc, tempfile()?.into()).await?;

        let mut res = Vec::new();
        file.seek(SeekFrom::Start(0)).await?;
        file.read_to_end(&mut res).await?;
        assert_eq!(&res, &data);
        assert_eq!(&content_type, "binary/random");
    }

    Ok(())
}
