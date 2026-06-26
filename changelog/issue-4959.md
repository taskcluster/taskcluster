audience: developers
level: patch
reference: issue 4959
---
Removed the outdated `Makefile` and the `lint.sh`/`test.sh` helper scripts in
`client-py`. Call `uv` directly instead: `uv run pytest` to test, `uv run
ruff check` to lint and `uv run ruff format` to format
