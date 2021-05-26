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
    async fn execute(&self, ctx: ExecutionContext<Payload>) -> Result<Success, anyhow::Error> {
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
                ctx.task_log.write_all("\n").await?;
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
        ctx.task_log.writeln("Starting container").await?;

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
                ctx.task_log.write_all(b.clone()).await?;
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

#[cfg(test)]
mod test {
    use super::*;
    use bollard::Docker;
    use serde_json::json;
    use taskcluster_lib_worker::task::Task;
    use taskcluster_lib_worker::testing::{execute_task, TestServiceFactory};

    #[tokio::test]
    async fn simple_echo_true() {
        let docker = Docker::connect_with_local_defaults().unwrap();
        let executor = ContainerExecutor::new(docker);

        let task = Task {
            payload: json!({
                "image": "alpine:latest",
                "command": ["sh", "-c", "echo hello!"],
            }),
            ..Default::default()
        };

        // this worker does not call any APIs, so it doesn't need any fakes
        let service_factory = TestServiceFactory {
            ..Default::default()
        };

        let result = execute_task(executor, task, Arc::new(service_factory))
            .await
            .unwrap();
        assert_eq!(result.success, Success::Succeeded);

        println!(
            "logs:\n{}",
            String::from_utf8_lossy(result.task_log.as_ref())
        );
        let mut found = false;
        for line in result.task_log.split(|c| *c == '\n' as u8) {
            if line == b"hello!" {
                found = true;
                break;
            }
        }
        assert!(found);
    }
}
