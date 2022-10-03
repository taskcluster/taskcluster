audience: general
level: minor
---

Add a docker-worker capability `disableSeccomp` to disable the seccomp
system call filter.

It allows significant information leakage, and its use should not be
considered secure. This is required to run `rr` inside a container, as
described here: https://github.com/mozilla/rr/wiki/Docker
