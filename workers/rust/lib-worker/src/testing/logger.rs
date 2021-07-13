use slog::{o, Drain, Logger};

/// Create a Logger for use in tests
pub fn test_logger() -> Logger {
    let decorator = slog_term::PlainSyncDecorator::new(slog_term::TestStdoutWriter);
    let drain = slog_term::FullFormat::new(decorator).build().fuse();

    Logger::root(drain, o!())
}
