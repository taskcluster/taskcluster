audience: deployers
level: minor
reference: issue 9279
---
The auth service now sets a rate limit on the temporary Sentry DSNs it creates via `auth.sentryDSN`, defaulting to 30 events per 60 seconds. Deployers can override this with the new `SENTRY_RATE_LIMIT_COUNT` and `SENTRY_RATE_LIMIT_WINDOW` (seconds) configuration values (`auth.sentry_rate_limit_count` and `auth.sentry_rate_limit_window` in the Helm values). Keys created before this change are not rate-limited, but they expire and are replaced within 48 hours.
