//! Internal support for retrying operations.
///
/// This is intended for use by this crate and special-purpose crates like `taskcluster-download`,
/// not for general use.
use backon::{BackoffBuilder, ExponentialBuilder};
use std::time::Duration;

/// Configuration for a client's automatic retrying.  The field names here match those
/// of the JS client.
#[derive(Debug, Clone)]
pub struct Retry {
    /// Number of retries (not counting the first try) for transient errors. Zero
    /// to disable retries entirely. (default 5)
    pub retries: usize,

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
/// [backon::ExponentialBackoff].
#[derive(Debug)]
pub struct Backoff {
    backoff: backon::ExponentialBackoff,
}

impl Backoff {
    pub fn new(retry: &Retry) -> Backoff {
        let builder = ExponentialBuilder::new()
            .with_min_delay(retry.delay_factor)
            .with_max_delay(retry.max_delay)
            .with_factor(2.0) // hard-coded value in JS client
            .with_max_times(retry.retries);

        #[cfg(not(test))]
        let builder = if retry.randomization_factor > 0.0 {
            builder.with_jitter()
        } else {
            builder
        };

        Backoff {
            backoff: builder.build(),
        }
    }

    /// Return the next backoff interval or, if the operation should not be retried,
    /// None.
    pub fn next_backoff(&mut self) -> Option<Duration> {
        self.backoff.next()
    }
}

#[cfg(test)]
mod test {
    use super::*;

    /// Check that two durations are approximately equal (within 1ms tolerance)
    /// to account for floating point variations in backon's calculations.
    fn approx_eq(a: Option<Duration>, b: Option<Duration>) -> bool {
        match (a, b) {
            (Some(a), Some(b)) => a.abs_diff(b) < Duration::from_millis(1),
            (None, None) => true,
            _ => false,
        }
    }

    #[tokio::test]
    async fn backoff_three_retries() {
        let retry = Retry {
            retries: 3,
            ..Default::default()
        };
        let mut backoff = Backoff::new(&retry);
        // ..try, fail
        assert!(approx_eq(
            backoff.next_backoff(),
            Some(Duration::from_millis(100))
        ));
        // ..retry 1, fail
        assert!(approx_eq(
            backoff.next_backoff(),
            Some(Duration::from_millis(200))
        ));
        // ..retry 2, fail
        assert!(approx_eq(
            backoff.next_backoff(),
            Some(Duration::from_millis(400))
        ));
        // ..retry 3, fail
        assert_eq!(backoff.next_backoff(), None); // out of retries
    }
}
