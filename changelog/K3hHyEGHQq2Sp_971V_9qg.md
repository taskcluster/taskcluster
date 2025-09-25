audience: users
level: patch
---
D2G: removes exit codes 125, 128 from `payload.onExitStatus.retry` array, as docker pulls now happen outside of the payload being run (inside the D2G task feature startup).
