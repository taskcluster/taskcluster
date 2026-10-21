audience: worker-deployers
level: patch
---
Generic Worker now reports crashes to Sentry with the maintained `github.com/getsentry/sentry-go` SDK, replacing the archived `raven-go` [SECURITY]. `raven-go` verified TLS against a CA bundle vendored in 2021, which still trusts the compromised emSign ECC Root CA - G3. Crash reports now use the system root CA store.
