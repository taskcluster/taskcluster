use async_trait::async_trait;
use bollard::container::{
    Config, CreateContainerOptions, LogOutput, LogsOptions, RemoveContainerOptions,
    StartContainerOptions,
};
use bollard::image::CreateImageOptions;
use bollard::Docker;
use futures::stream::StreamExt;
use serde::Deserialize;
use slog::{debug, info, o};
use std::sync::Arc;
use taskcluster_lib_worker::execute::{ExecutionContext, Executor, Success};

/// A container-worker payload
#[derive(Debug, Deserialize)]
pub(crate) struct Payload {
    pub(crate) image: String,
    pub(crate) command: Vec<String>,
}

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
    async fn execute(&self, mut ctx: ExecutionContext<Payload>) -> Result<Success, anyhow::Error> {
        info!(ctx.logger, "executing task");

        let image_id = ctx.payload.image.as_ref();
        debug!(ctx.logger, "downloading image"; o!("image_id" => image_id));
        ctx.task_log
            .write_all(format!("Downloading image {}\n", image_id))
            .await?;
        let mut log_stream = self.docker.create_image(
            // TODO: ensure this specifies a single image? `alpine` seems to dl all of them
            Some(CreateImageOptions::<&str> {
                from_image: image_id,
                ..Default::default()
            }),
            None,
            None,
        );
        while let Some(bi_res) = log_stream.next().await {
            if let Some(b) = bi_res?.status {
                ctx.task_log.write_all(b).await?;
                ctx.task_log.write_all(b"\n").await?;
            }
        }

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
        ctx.task_log.write_all("Starting container\n").await?;

        self.docker
            .start_container(
                container_name.as_ref(),
                None::<StartContainerOptions<String>>,
            )
            .await?;

        debug!(ctx.logger, "reading logs"; o!("container_id" => &container_id));
        let mut log_stream = self.docker.logs(
            container_name.as_ref(),
            Some(LogsOptions {
                follow: true,
                stdout: true,
                stderr: true,
                tail: "all".to_string(),
                ..Default::default()
            }),
        );

        while let Some(log_data_res) = log_stream.next().await {
            if let Some(b) = match log_data_res? {
                LogOutput::StdOut { message: ref b } => Some(b),
                LogOutput::StdErr { message: ref b } => Some(b),
                LogOutput::Console { message: ref b } => Some(b),
                _ => None,
            } {
                ctx.task_log.write_all(b).await?;
            }
        }

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

        // TODO: get exit status of docker container
        Ok(Success::Succeeded)
    }
}
