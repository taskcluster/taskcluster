use bollard::Docker;
use slog::{info, Logger};
use taskcluster::Credentials;
use taskcluster_lib_worker::claim::{WorkClaimer, WorkClaimerConfig};
use taskcluster_lib_worker::process::ProcessFactory;

mod execution;
mod executor;
mod task;

use crate::executor::ContainerExecutor;

pub async fn main(logger: Logger) -> anyhow::Result<()> {
    // TODO: load config
    let root_url = "https://dustin.taskcluster-dev.net";

    info!(logger, "Starting Worker");

    let docker = Docker::connect_with_local_defaults()?;
    let executor = ContainerExecutor::new(root_url.to_owned(), docker);

    let wc = WorkClaimer::new(WorkClaimerConfig {
        logger: logger.clone(),
        root_url: root_url.to_owned(),
        worker_creds: Credentials::from_env()?,
        task_queue_id: "aa/bb".to_owned(),
        worker_group: "rust".to_owned(),
        worker_id: "worker".to_owned(),
        capacity: 4,
        executor,
    });
    let wc = wc.start();
    wc.await
}
