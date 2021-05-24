use crate::task::Payload;
use async_trait::async_trait;
use bollard::container::{
    Config, CreateContainerOptions, LogOutput, LogsOptions, RemoveContainerOptions,
    StartContainerOptions,
};
use bollard::image::CreateImageOptions;
use bollard::Docker;
use chrono::prelude::*;
use futures::stream::TryStreamExt;
use serde::Deserialize;
use slog::{debug, info, o};
use std::io::Write;
use std::sync::Arc;
use taskcluster::{ClientBuilder, Credentials, Object, Retry};
use taskcluster_lib_worker::executor::{ExecutionContext, Executor, Success};
use taskcluster_upload::upload_from_buf;

/// An executor for container-worker tasks.
#[derive(Clone)]
pub(crate) struct ContainerExecutor {
    docker: Arc<Docker>,
}

impl ContainerExecutor {
    pub(crate) fn new(docker: Docker) -> Self {
        Self {
            docker: Arc::new(docker),
        }
    }
}

#[async_trait]
impl Executor<Payload> for ContainerExecutor {
    async fn execute(&self, ctx: ExecutionContext<Payload>) -> Result<Success, anyhow::Error> {
        let mut log: Vec<u8> = Vec::new();

        info!(ctx.logger, "executing task");

        debug!(ctx.logger, "downloading image");
        self.docker
            .create_image(
                // TODO: ensure this specifies a single image? `alpine` seems to dl all of them
                Some(CreateImageOptions::<&str> {
                    from_image: ctx.payload.image.as_ref(),
                    ..Default::default()
                }),
                None,
                None,
            )
            .try_for_each(|bi| {
                if let Some(ref msg) = bi.status {
                    log.write_all(msg.as_bytes()).unwrap();
                    log.push(b'\n');
                }
                std::future::ready(Ok(()))
            })
            .await?;

        let container_name = format!("{}-run{}", ctx.task_id, ctx.run_id);
        debug!(ctx.logger, "creating container {}", &container_name);

        let result = self
            .docker
            .create_container(
                Some(CreateContainerOptions {
                    name: container_name.clone(),
                }),
                Config {
                    cmd: Some(ctx.payload.command.clone()),
                    image: Some(ctx.payload.image.clone()),
                    ..Default::default()
                },
            )
            .await?;

        let container_id = result.id.clone();
        assert_ne!(container_id.len(), 0);
        debug!(ctx.logger, "starting container"; o!("container_id" => &container_id));

        self.docker
            .start_container(
                container_name.as_ref(),
                None::<StartContainerOptions<String>>,
            )
            .await?;

        debug!(ctx.logger, "reading logs"; o!("container_id" => &container_id));
        self.docker
            .logs(
                container_name.as_ref(),
                Some(LogsOptions {
                    follow: true,
                    stdout: true,
                    stderr: true,
                    tail: "all".to_string(),
                    ..Default::default()
                }),
            )
            .try_for_each(|lo| {
                if let Some(b) = match lo {
                    LogOutput::StdOut { message: ref b } => Some(b),
                    LogOutput::StdErr { message: ref b } => Some(b),
                    LogOutput::Console { message: ref b } => Some(b),
                    _ => None,
                } {
                    log.write_all(b).unwrap();
                }
                std::future::ready(Ok(()))
            })
            .await?;

        debug!(ctx.logger, "removing container");
        self.docker
            .remove_container(
                container_name.as_ref(),
                Some(RemoveContainerOptions {
                    force: true,
                    ..Default::default()
                }),
            )
            .await?;

        debug!(ctx.logger, "uploading live-log artifact");
        let run_id_str = format!("{}", ctx.run_id);
        let res = ctx
            .queue_factory
            .queue()?
            .createArtifact(
                &ctx.task_id,
                &run_id_str,
                "public/logs/live.log",
                &serde_json::json!({
                    "storageType": "object",
                    "contentType": "text/plain",
                    "expires": ctx.task_def.expires,
                }),
            )
            .await?;

        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct CreateArtifactResponse {
            credentials: Credentials,
            expires: DateTime<Utc>,
            name: String,
            project_id: String,
            upload_id: String,
        }
        let res: CreateArtifactResponse = serde_json::from_value(res)?;

        let object = Object::new(ClientBuilder::new(&ctx.root_url).credentials(res.credentials))?;
        let retry = Retry::default();
        upload_from_buf(
            &res.project_id,
            &res.name,
            "text/plain",
            &res.expires,
            &log,
            &retry,
            &object,
            &res.upload_id,
        )
        .await?;

        ctx.queue_factory
            .queue()?
            .finishArtifact(
                &ctx.task_id,
                &run_id_str,
                "public/logs/live.log",
                &serde_json::json!({
                    "uploadId": res.upload_id,
                }),
            )
            .await?;

        // TODO: get exit status of docker container
        Ok(Success::Succeeded)
    }
}
