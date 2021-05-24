//! This module implements generic support for independent tokio Tasks that communicate via
//! channels.  To avoid confusion with Taskcluster tasks, and in a nod to the "Communicating
//! Sequntial Procesess" model, it uses the term "process" instead of "task".
//!
//! Every [`Process`] is constructed from a one-shot factory that defines initial conditions for
//! the process, and once started can not be accessed externally.  Instead, whoever holds the
//! [`Process`] can send commands to it, stop it, or wait for it to complete.  Any other
//! communication channels should be arranged in advance via the factory.

use anyhow::{anyhow, Context as AnyhowContext, Result};
use async_trait::async_trait;
use futures::future::select_all;
use pin_project::pin_project;
use std::pin::Pin;
use std::task::{Context, Poll};
use tokio::sync::mpsc;
use tokio::task::JoinHandle;

/// A Process represents a running process, to which messages can be sent to control its behavior.
///
/// ## Process Completion
///
/// A Process acts much like a JoinHandle, and can be awaited to wait for its completion.
#[pin_project]
pub struct Process<CMD>
where
    CMD: 'static + Sync + Send + std::fmt::Debug,
{
    commands: Option<mpsc::Sender<CMD>>,
    #[pin]
    join_handle: JoinHandle<Result<()>>,
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
}

impl<CMD> std::future::Future for Process<CMD>
where
    CMD: 'static + Sync + Send + std::fmt::Debug,
{
    type Output = Result<()>;
    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        match self.project().join_handle.poll(cx) {
            Poll::Pending => Poll::Pending,
            Poll::Ready(Err(e)) => Poll::Ready(Err(e).context("Process panicked")),
            Poll::Ready(Ok(r)) => Poll::Ready(r),
        }
    }
}

/// A ProcessFactory defines the starting conditions for a process, and exposes a `start` method
/// to initiate the process itself.
#[async_trait]
pub trait ProcessFactory {
    type Command: 'static + Sync + Send + std::fmt::Debug;

    /// Start the process. This takes ownership of self, making self a good spot to put any
    /// initial configuration for the process.  The returned value represents the running
    /// process.
    fn start(self) -> Process<Self::Command>
    where
        Self: 'static + Send + Sized,
    {
        let (cmd_tx, cmd_rx) = mpsc::channel(10);
        let join_handle = tokio::spawn(async move { self.run(cmd_rx).await });
        Process {
            commands: Some(cmd_tx),
            join_handle,
        }
    }

    /// Implementation of the process.  This will typically loop receiving commands and taking any
    /// other actions required of the process.  The process should stop gracefully when the sender
    /// is dropped (that is, `commands.recv()` returns None).
    async fn run(self, commands: mpsc::Receiver<Self::Command>) -> Result<()>;
}

/// A set of processes, which can be stopped and waited-for as a group.  New processes
/// can be added, but processes are only removed when they are finished.
pub struct ProcessSet<CMD>
where
    CMD: 'static + Sync + Send + std::fmt::Debug,
{
    procs: Vec<Process<CMD>>,
}

impl<CMD> ProcessSet<CMD>
where
    CMD: 'static + Sync + Send + std::fmt::Debug,
{
    /// Create a new ProcessSet with zero processes.
    pub fn new() -> Self {
        ProcessSet { procs: vec![] }
    }

    /// Add a process to this process set
    pub fn add(&mut self, proc: Process<CMD>) {
        self.procs.push(proc);
    }

    /// Get the number of proceses in this process set.  Note that this may
    /// include some processes which have completed but which have not yet
    /// been consumed by `wait()`.
    pub fn len(&self) -> usize {
        self.procs.len()
    }

    /// Iterate over the processes in this process set, mutably.
    pub fn iter(&mut self) -> std::slice::IterMut<'_, Process<CMD>> {
        self.procs.iter_mut()
    }

    /// Stop all processes in this process set
    pub async fn stop(&mut self) -> Result<()> {
        for proc in self.procs.iter_mut() {
            proc.stop().await?;
        }
        Ok(())
    }

    /// Wait for a process in this set to exit.  On return, the process set
    /// is one process smaller.  If called with no processes, this will wait
    /// forever.  Paniced processes result in an error return.
    pub async fn wait(&mut self) -> Result<()> {
        if self.len() == 0 {
            return std::future::pending().await;
        }

        let (res, i, _) = select_all(self.procs.iter_mut()).await;
        self.procs.swap_remove(i);
        res
    }

    /// Wait for all contained processes to exit.
    pub async fn wait_all(&mut self) -> Result<()> {
        while self.len() > 0 {
            self.wait().await?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::Arc;

    #[tokio::test]
    async fn start_and_command_and_stop() {
        #[derive(Debug)]
        struct FooCommand;
        struct Factory {
            foos: Arc<AtomicU32>,
        };

        #[async_trait]
        impl ProcessFactory for Factory {
            type Command = FooCommand;

            async fn run(self, mut commands: mpsc::Receiver<Self::Command>) -> Result<()> {
                loop {
                    if let Some(_) = commands.recv().await {
                        self.foos.fetch_add(1, Ordering::SeqCst);
                    } else {
                        break;
                    }
                }

                Ok(())
            }
        }

        let foos = Arc::new(AtomicU32::new(0));
        let factory = Factory { foos: foos.clone() };
        let mut process = factory.start();

        // wait a few milliseconds, demonstrating that we can select and drop
        // the wait() call
        tokio::select! {
            _ = (&mut process) => { panic!("process stopped early"); },
            _ = tokio::time::sleep(tokio::time::Duration::from_millis(5)) => {},
        };

        assert_eq!(foos.load(Ordering::SeqCst), 0u32);

        process.command(FooCommand).await.unwrap();

        tokio::select! {
            _ = (&mut process) => { panic!("process stopped early"); },
            _ = tokio::time::sleep(tokio::time::Duration::from_millis(5)) => {},
        };

        assert_eq!(foos.load(Ordering::SeqCst), 1u32);

        process.stop().await.unwrap();

        // this time, wait should resolve
        tokio::select! {
            _ = (&mut process) => { },
            // 100ms here to allow time for message proapagation
            _ = tokio::time::sleep(tokio::time::Duration::from_millis(100)) => { panic!("wait did not resolve"); },
        };

        assert_eq!(foos.load(Ordering::SeqCst), 1u32);
    }

    #[tokio::test]
    async fn process_error() {
        struct Factory;

        #[async_trait]
        impl ProcessFactory for Factory {
            type Command = ();

            async fn run(self, _commands: mpsc::Receiver<Self::Command>) -> Result<()> {
                anyhow::bail!("uhoh!");
            }
        }

        let process = Factory.start();
        assert!(process.await.is_err());
    }

    #[tokio::test]
    async fn process_panic() {
        struct Factory;

        #[async_trait]
        impl ProcessFactory for Factory {
            type Command = ();

            async fn run(self, _commands: mpsc::Receiver<Self::Command>) -> Result<()> {
                panic!("uhoh!");
            }
        }

        let process = Factory.start();
        assert!(process.await.is_err());
    }

    #[tokio::test]
    async fn process_set() {
        struct Factory {
            id: u32,
        };

        #[async_trait]
        impl ProcessFactory for Factory {
            type Command = ();

            async fn run(self, _commands: mpsc::Receiver<Self::Command>) -> Result<()> {
                // task just pauses for long enough to schedule other stuff
                tokio::time::sleep(tokio::time::Duration::from_millis(1)).await;
                dbg!(self.id);
                Ok(())
            }
        }

        let mut id = 0;
        let mut processes = ProcessSet::new();

        // create an initial task
        processes.add(Factory { id }.start());
        id += 1;

        loop {
            tokio::select! {
                _ = processes.wait() => {
                    if id < 200 {
                        // for every finished process, add two more
                        processes.add(Factory{ id }.start());
                        id += 1;
                        processes.add(Factory{ id }.start());
                        id += 1;
                    }
                }
            }

            if processes.len() == 0 {
                break;
            }
        }
    }

    /// Test that ProcessSet::wait can be dropped without dropping all of the processes
    #[tokio::test]
    async fn process_set_wait_dropped() {
        struct Factory;

        #[async_trait]
        impl ProcessFactory for Factory {
            type Command = ();

            async fn run(self, _commands: mpsc::Receiver<Self::Command>) -> Result<()> {
                // 50 millis is long enough for the first select to finish, dropping
                // the `processes.wait()` Future
                tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
                Ok(())
            }
        }

        let mut processes = ProcessSet::new();

        // create some initial tasks
        processes.add(Factory.start());
        processes.add(Factory.start());

        // nothing is ready yet, so this should fall through, and in the process
        // drop the processes.await() future
        tokio::select! {
            biased;
            _ = processes.wait() => {panic!("should not have gotten here") }
            _ = std::future::ready(()) => {},
        }

        assert_eq!(processes.len(), 2);
        processes.wait().await.unwrap();
        assert_eq!(processes.len(), 1);
        processes.wait().await.unwrap();
        assert_eq!(processes.len(), 0);
    }

    #[tokio::test]
    async fn process_set_wait_all() {
        struct Factory {
            counter: Arc<AtomicU32>,
        };

        #[async_trait]
        impl ProcessFactory for Factory {
            type Command = ();

            async fn run(self, _commands: mpsc::Receiver<Self::Command>) -> Result<()> {
                // task just pauses for long enough to schedule other stuff
                tokio::time::sleep(tokio::time::Duration::from_millis(1)).await;
                self.counter.fetch_add(1, Ordering::SeqCst);
                Ok(())
            }
        }

        let mut processes = ProcessSet::new();

        let counter = Arc::new(AtomicU32::new(0));
        for _ in 0..100 {
            processes.add(
                Factory {
                    counter: counter.clone(),
                }
                .start(),
            );
        }

        processes.wait_all().await.unwrap();

        assert_eq!(counter.load(Ordering::SeqCst), 100);
    }
}
