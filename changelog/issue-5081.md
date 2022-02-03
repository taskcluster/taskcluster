audience: worker-deployers
level: minor
reference: issue 5081
---
generic-worker no longer relies on //go:uintptrescapes pragma as described in
https://github.com/golang/go/blob/go1.17.6/src/cmd/compile/internal/noder/lex.go#L71-L81
and therefore we should see reduced crashes when e.g. deleting profiles on Windows.
