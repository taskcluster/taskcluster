//! Internal support for retrying operations.
///
/// This is intended for use by this crate and special-purpose crates like `taskcluster-download`,
/// not for general use.
use backoff::backoff::Backoff as BackoffTrait;
use backoff::ExponentialBackoff;
use std::time::Duration;

/// Configuration for a client's automatic retrying.  The field names here match those
/// of the JS client.
#[derive(Debug, Clone)]
pub struct Retry {
    /// Number of retries (not counting the first try) for transient errors. Zero
    /// to disable retries entirely. (default 5)
    pub retries: u32,

    /// Maximum interval between retries (default 30s)
    pub max_delay: Duration,

    /// Factor for delay: 2 ^ retry * delay_factor.  100ms (default) is a good value for servers,
    /// and 500ms a good value for background processes. (default 100ms)
    pub delay_factor: Duration,

    /// Randomization factor added as.
    /// delay = delay * random([1 - randomizationFactor; 1 + randomizationFactor]) (default 0.25)
    pub randomization_factor: f64,
}

impl Default for Retry {
    fn default() -> Self {
        Self {
            retries: 5,
            max_delay: Duration::from_secs(30),
            delay_factor: Duration::from_millis(100),
            randomization_factor: 0.25,
        }
    }
}

/// Backoff tracker for a single, possibly-retried operation.  This is a thin wrapper around
/// [backoff::ExponentialBackoff].
#[derive(Debug)]
pub struct Backoff<'a> {
    retry: &'a Retry,
    tries: u32,
    backoff: ExponentialBackoff,
}

impl<'a> Backoff<'a> {
    pub fn new(retry: &Retry) -> Backoff {
        let mut backoff = ExponentialBackoff {
            max_elapsed_time: None, // we count retries instead
            max_interval: retry.max_delay,
            initial_interval: retry.delay_factor,
            multiplier: 2.0, // hard-coded value in JS client
            #[cfg(not(test))]
            randomization_factor: retry.randomization_factor,
            #[cfg(test)]
            randomization_factor: 0.0,
            ..Default::default()
        };
        backoff.reset();
        Backoff {
            retry,
            tries: 0,
            backoff,
        }
    }

    /// Return the next backoff interval or, if the operation should not be retried,
    /// None.
    pub fn next_backoff(&mut self) -> Option<Duration> {
        self.tries += 1;
        if self.tries > self.retry.retries {
            None
        } else {
            self.backoff.next_backoff()
        }
    }
}

#[cfg(test)]
mod test {
    use super::*;

    #[tokio::test]
    async fn backoff_three_retries() {
        let retry = Retry {
            retries: 3,
            ..Default::default()
        };
        let mut backoff = Backoff::new(&retry);
        // ..try, fail
        assert_eq!(backoff.next_backoff(), Some(Duration::from_millis(100)));
        // ..retry 1, fail
        assert_eq!(backoff.next_backoff(), Some(Duration::from_millis(200)));
        // ..retry 2, fail
        assert_eq!(backoff.next_backoff(), Some(Duration::from_millis(400)));
        // ..retry 3, fail
        assert_eq!(backoff.next_backoff(), None); // out of retries
    }
}
