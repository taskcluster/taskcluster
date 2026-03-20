//! Taskcluster Generic Worker - Cross-platform task execution engine
//!
//! This is the Rust implementation of the Taskcluster Generic Worker,
//! responsible for claiming tasks from the Taskcluster Queue service,
//! executing them, and reporting results.

use generic_worker::{errors, model, runtime, worker};

// Engine module is available via generic_worker::engine
// for task execution, environment setup, and directory management.

use clap::{Parser, Subcommand};
use std::process::ExitCode;
use tracing_subscriber::EnvFilter;

/// Taskcluster Generic Worker
#[derive(Parser)]
#[command(name = "generic-worker", version, about)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Run the worker
    Run {
        /// Path to configuration file
        #[arg(long, default_value = "generic-worker.config")]
        config: String,

        /// Configure from worker-runner via protocol pipe
        #[arg(long)]
        with_worker_runner: bool,
    },
    /// Show the JSON schema for the payload
    ShowPayloadSchema,
    /// Create a new Ed25519 signing key pair
    NewEd25519Keypair {
        /// Path to write the private key
        #[arg(long)]
        file: String,
    },
    /// Run the worker loop directly (for testing)
    RunWorker {
        /// Path to configuration file
        #[arg(long)]
        config: String,
    },
    /// Install the worker as a system service (Windows)
    Install {
        /// Path to configuration file
        #[arg(long)]
        config: String,

        /// NSSMPath for Windows service
        #[arg(long)]
        nssm: Option<String>,
    },
}

#[tokio::main]
async fn main() -> ExitCode {
    // Initialize tracing/logging
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let cli = Cli::parse();

    match cli.command {
        Commands::Run {
            config: config_path,
            with_worker_runner,
        } => match worker::run_worker(&config_path, with_worker_runner).await {
            Ok(exit_code) => exit_code.into(),
            Err(e) => {
                tracing::error!("Worker failed: {e:#}");
                errors::WorkerExitCode::InternalError.into()
            }
        },
        Commands::RunWorker { config: config_path } => {
            match worker::run_worker(&config_path, false).await {
                Ok(exit_code) => exit_code.into(),
                Err(e) => {
                    tracing::error!("Worker failed: {e:#}");
                    errors::WorkerExitCode::InternalError.into()
                }
            }
        }
        Commands::ShowPayloadSchema => {
            println!("{}", model::payload_schema_json());
            ExitCode::SUCCESS
        }
        Commands::NewEd25519Keypair { file } => {
            match runtime::create_ed25519_keypair(&file) {
                Ok(()) => {
                    println!("Ed25519 keypair written to {file}");
                    ExitCode::SUCCESS
                }
                Err(e) => {
                    eprintln!("Failed to create keypair: {e}");
                    errors::WorkerExitCode::CantCreateEd25519Keypair.into()
                }
            }
        }
        Commands::Install { config, nssm } => {
            #[cfg(target_os = "windows")]
            {
                match runtime::install_service(&config, nssm.as_deref()) {
                    Ok(()) => ExitCode::SUCCESS,
                    Err(e) => {
                        eprintln!("Failed to install service: {e}");
                        errors::WorkerExitCode::CantInstallGenericWorker.into()
                    }
                }
            }
            #[cfg(not(target_os = "windows"))]
            {
                let _ = (config, nssm);
                eprintln!("Install command is only supported on Windows");
                errors::WorkerExitCode::CantInstallGenericWorker.into()
            }
        }
    }
}
