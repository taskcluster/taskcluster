//! This module contains utilities for testing object-service interfaces

use httptest::matchers::{ExecutionContext, Matcher};
use std::fmt;
use std::sync::Mutex;

/// Event logger, used to log events in the fake ObjectService implementations
#[derive(Default)]
pub(crate) struct Logger {
    logged: Mutex<Vec<String>>,
}

impl Logger {
    pub(crate) fn log<S: Into<String>>(&self, message: S) {
        self.logged.lock().unwrap().push(message.into())
    }

    pub(crate) fn assert(&self, expected: Vec<String>) {
        assert_eq!(*self.logged.lock().unwrap(), expected);
    }
}

/// Log the matched value with `dbg!()` and always match.
pub(crate) struct Dbg;
impl<IN> Matcher<IN> for Dbg
where
    IN: fmt::Debug + ?Sized,
{
    fn matches(&mut self, input: &IN, _ctx: &mut ExecutionContext) -> bool {
        dbg!(input);
        true
    }

    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "Dbg()")
    }
}
