//! Generic support for independent tokio Tasks that communicate via channels.  To avoid confusion
//! with Taskcluster tasks, and in a nod to the "Communicating Sequntial Procesess" model.

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use tokio::sync::mpsc;
use tokio::task::JoinHandle;

/// A Process represents a running process, to which messages can be sent to control its behavior.
pub struct Process<CMD> {
    commands: Option<mpsc::Sender<CMD>>,
    async_task: JoinHandle<()>,
}

impl<CMD> Process<CMD>
where
    CMD: 'static + Sync + Send + std::fmt::Debug,
{
    /// Send a command to this process
    pub async fn command(&self, command: CMD) -> Result<()> {
        let commands = self
            .commands
            .as_ref()
            .ok_or_else(|| anyhow!("Process is already stopping"))?;
        Ok(commands.send(command).await?)
    }

    /// Signal that this process should stop, by closing its command channel.
    /// No further commands can be sent after this call.
    pub async fn stop(&mut self) -> Result<()> {
        self.commands = None;
        Ok(())
    }

    /// Wait for this process to complete.
    // TODO: &mut self, wait for a stopped message on a oneshot channel, etc.
    pub async fn wait(self) -> Result<()> {
        Ok(self.async_task.await?)
    }
}

// TODO: support broadcast susbcriptions, too

/// A ProcessFactory defines the starting conditions for a process, and exposes a `start` method
/// to initiate the process itself.
#[async_trait]
pub trait ProcessFactory {
    type Command: 'static + Send;

    /// Start the process. This takes ownership of self, making self a good spot to put any
    /// initial configuration for the process.  The returned value represents the running
    /// process.
    fn start(self) -> Process<Self::Command>
    where
        Self: 'static + Send + Sized,
    {
        let (tx, rx) = mpsc::channel(10);
        let async_task = tokio::spawn(async move {
            self.run(rx).await;
        });
        Process {
            commands: Some(tx),
            async_task,
        }
    }

    /// Implementation of the process.  This will typically loop receiving commands and taking
    /// any other actions required of the process.  The process should stop when the sender is
    /// drpoped.
    async fn run(self, commands: mpsc::Receiver<Self::Command>);
}

#[cfg(test)]
mod test {
    use super::*;

    #[tokio::test]
    async fn start_and_stop() {
        #[derive(Debug)]
        struct StopCommand;
        struct Factory;

        #[async_trait]
        impl ProcessFactory for Factory {
            type Command = StopCommand;

            async fn run(self, mut commands: mpsc::Receiver<Self::Command>) {
                commands.recv().await;
            }
        }

        let factory = Factory;
        let process = factory.start();

        process.command(StopCommand).await.unwrap();
        process.wait().await.unwrap();
    }
}
