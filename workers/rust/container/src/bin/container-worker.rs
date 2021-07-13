#[tokio::main]
async fn main() -> anyhow::Result<()> {
    container_worker::main().await?;
    // there is a bug, perhaps in tokio, where the process does not exit despite finishing main(),
    // so we force the issue.
    std::process::exit(0)
}
