audience: users
level: patch
reference: issue 7776
---
The GitHub service now accepts `.` in repository names, fixing 500 errors from `github.builds()` for repositories like `foo.rs`.
