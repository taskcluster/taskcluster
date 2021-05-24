use bollard::container::{
    Config, CreateContainerOptions, LogOutput, LogsOptions, RemoveContainerOptions,
    StartContainerOptions,
};
use bollard::image::CreateImageOptions;
use bollard::Docker;
use futures::stream::TryStreamExt;
use serde::Deserialize;
use slog::{debug, info, o, Logger};
use std::convert::TryFrom;
use std::sync::Arc;
use taskcluster::{ClientBuilder, Credentials, Queue};
use taskcluster_lib_worker::claim::TaskClaim;
use taskcluster_lib_worker::task::Task as TaskDefinition;

/// A container-worker payload
#[derive(Debug, Deserialize)]
pub(crate) struct Payload {
    image: String,
    command: Vec<String>,
}

/// A task, as it is being executed.
#[derive(Debug)]
pub(crate) struct Task {
    task_id: String,
    run_id: u32,
    task_def: TaskDefinition,
    payload: Payload,
}

impl TryFrom<TaskClaim> for Task {
    type Error = serde_json::Error;

    fn try_from(task_claim: TaskClaim) -> Result<Self, Self::Error> {
        Ok(Self {
            task_id: task_claim.task_id,
            run_id: task_claim.run_id,
            payload: task_claim.task.payload()?,
            task_def: task_claim.task,
        })
    }
}

impl Task {
    pub(crate) async fn run(
        self,
        root_url: String,
        credentials: Credentials,
        logger: Logger,
        docker: Arc<Docker>,
    ) -> anyhow::Result<()> {
        // TODO: queue factory
        let queue = Queue::new(ClientBuilder::new(&root_url).credentials(credentials.clone()))?;
        info!(logger, "executing task");

        debug!(logger, "downloading image");
        docker
            .create_image(
                // TODO: ensure this specifies a single image? `alpine` seems to dl all of them
                Some(CreateImageOptions::<&str> {
                    from_image: self.payload.image.as_ref(),
                    ..Default::default()
                }),
                None,
                None,
            )
            .try_for_each(|bi| {
                if let Some(ref msg) = bi.status {
                    info!(logger, "{}", msg);
                }
                std::future::ready(Ok(()))
            })
            .await?;

        let container_name = format!("{}-run{}", self.task_id, self.run_id);
        debug!(logger, "creating container {}", &container_name);

        let result = docker
            .create_container(
                Some(CreateContainerOptions {
                    name: container_name.clone(),
                }),
                Config {
                    cmd: Some(self.payload.command.clone()),
                    image: Some(self.payload.image.clone()),
                    ..Default::default()
                },
            )
            .await?;

        let container_id = result.id.clone();
        assert_ne!(container_id.len(), 0);
        debug!(logger, "starting container"; o!("container_id" => &container_id));

        docker
            .start_container(
                container_name.as_ref(),
                None::<StartContainerOptions<String>>,
            )
            .await?;

        debug!(logger, "reading logs"; o!("container_id" => &container_id));
        docker
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
                match lo {
                    LogOutput::StdOut { message: b } => info!(logger, "log: {:?}", b),
                    LogOutput::StdErr { message: b } => info!(logger, "err: {:?}", b),
                    LogOutput::Console { message: b } => info!(logger, "console: {:?}", b),
                    _ => {}
                };
                std::future::ready(Ok(()))
            })
            .await?;

        debug!(logger, "removing container");
        docker
            .remove_container(
                container_name.as_ref(),
                Some(RemoveContainerOptions {
                    force: true,
                    ..Default::default()
                }),
            )
            .await?;

        info!(logger, "completing task");
        queue
            .reportCompleted(&self.task_id, &format!("{}", self.run_id))
            .await?;
        Ok(())
    }
}
