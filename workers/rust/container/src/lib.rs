use bollard::Docker;
use taskcluster::Credentials;
use taskcluster_lib_worker::Worker;

mod executor;

use crate::executor::ContainerExecutor;

pub async fn main() -> anyhow::Result<()> {
    // TODO: load config
    let root_url = "https://dustin.taskcluster-dev.net";

    let docker = Docker::connect_with_local_defaults()?;
    let executor = ContainerExecutor::new(docker);

    let w = Worker::new(executor)
        .root_url(root_url)
        .worker_creds(Credentials::from_env()?)
        .task_queue_id("aa/bb".to_owned())
        .worker_group("rust".to_owned())
        .worker_id("worker".to_owned())
        .capacity(4)
        .start();
    w.await
}
