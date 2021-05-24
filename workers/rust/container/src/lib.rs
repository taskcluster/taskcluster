use slog::{info, Logger};
use taskcluster::Credentials;
use taskcluster_lib_worker::claim::{WorkClaimer, WorkClaimerConfig};
use taskcluster_lib_worker::process::ProcessFactory;

mod executor;

use crate::executor::ContainerExecutor;

pub async fn main(logger: Logger) {
    info!(logger, "Starting Worker");

    let root_url = "https://dustin.taskcluster-dev.net";
    let wc = WorkClaimer::new(WorkClaimerConfig {
        logger: logger.clone(),
        root_url: root_url.to_owned(),
        worker_creds: Credentials::from_env().unwrap(),
        task_queue_id: "aa/bb".to_owned(),
        worker_group: "rust".to_owned(),
        worker_id: "worker".to_owned(),
        capacity: 4,
        executor: ContainerExecutor::new(root_url.to_owned()),
    });
    let wc = wc.start();
    wc.await.unwrap();
}
