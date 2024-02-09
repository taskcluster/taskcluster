audience: general
level: patch
---
Switched to use `math/rand/v2` ([new in go1.22](https://tip.golang.org/doc/go1.22#math_rand_v2)), removed [deprecated](https://pkg.go.dev/golang.org/x/sys@v0.16.0/windows#OpenCurrentProcessToken) call to `windows.OpenCurrentProcessToken()`, fixed `staticcheck` errors, and added a `staticcheck` GitHub actions workflow for our repo.
