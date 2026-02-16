# CLAUDE.md - Generic Worker

This file provides guidance specific to developing the generic worker (`workers/generic-worker/`).
For repo-wide guidance, see the root [CLAUDE.md](/CLAUDE.md).

## Build Tags

Generic worker uses Go build tags for two engine modes:
- **`insecure`** - runs tasks as the current user (no user separation)
- **`multiuser`** - creates separate OS users per task (production mode)

Platform-specific files use combined tags like `multiuser && (darwin || linux || freebsd)`.

**Important**: When making changes, verify compilation across **all** variants:
```bash
cd workers/generic-worker
GOOS=linux   go build -tags insecure .
GOOS=linux   go build -tags multiuser .
GOOS=darwin  go build -tags insecure .
GOOS=darwin  go build -tags multiuser .
GOOS=windows go build -tags multiuser .
GOOS=freebsd go build -tags insecure .
GOOS=freebsd go build -tags multiuser .
```

## Testing

```bash
cd workers/generic-worker

# Quick test (insecure engine, current platform)
go test -tags insecure -count 1 -ldflags "-X github.com/taskcluster/taskcluster/v96/workers/generic-worker.revision=$(git rev-parse HEAD)" -v ./...

# Quick build (insecure engine, current platform)
go build -tags insecure -ldflags "-X main.revision=$(git rev-parse HEAD)" .

# Full build (both engines, current platform, includes go vet + test compilation)
bash build.sh -s          # -s skips code generation (use if you already ran yarn generate)

# Full build + tests + linters
bash build.sh -st         # -s skips codegen, -t runs tests and linters

# Build all platform variants
bash build.sh -a
```

**Important**: The `-ldflags` flag is required to embed the git revision. Without it, `TestRevisionNumberStored` will fail.
Note the syntax differs: `go build` uses `-X main.revision=...` while `go test` needs the full package path `-X github.com/taskcluster/taskcluster/v96/workers/generic-worker.revision=...`. The `build.sh` script handles this automatically.

The `-t` flag in `build.sh` runs:
- `go test` with `-race` flag (insecure engine)
- `go tool golint`
- `go tool ineffassign`
- `go tool goimports -w .`

## Formatting and Linting

### Before committing
```bash
# Fix imports and formatting (from repo root)
go tool goimports -w workers/generic-worker/

# Lint both engine variants
golangci-lint run --build-tags insecure --timeout=5m workers/generic-worker/...
golangci-lint run --build-tags multiuser --timeout=5m workers/generic-worker/...
```

The golangci-lint config is at the repo root (`.golangci.yml`). Required version is in `.golangci-lint-version`.

### yarn generate

Required when changing APIs, database schema, generic-worker schemas/exit codes, or Go code structure.
Requires Postgres to be running:

```bash
# Start Postgres in background
docker run --rm -d -p 127.0.0.1:5432:5432 \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e LC_COLLATE=en_US.UTF8 \
  -e LC_CTYPE=en_US.UTF8 \
  postgres:15

# Run generate (from repo root, requires Node 24.x and Yarn 4.x via corepack)
export TEST_DB_URL=postgresql://postgres@localhost/postgres
yarn generate
```

If `yarn generate` produces no diff beyond your changes, they are consistent with generated output.

## Architecture Notes

### Platform dispatch pattern

Engine-specific behavior is split across files with build tags:
- `insecure.go` / `multiuser.go` - core engine logic (all platforms)
- `multiuser_posix.go` - multiuser on darwin/linux/freebsd
- `multiuser_windows.go` - multiuser on windows
- `insecure_posix.go` - insecure on darwin/linux/freebsd
- `mounts_insecure.go` / `mounts_multiuser.go` - mount operations per engine
- `artifacts_insecure.go` / `artifacts_multiuser.go` - artifact operations per engine
- `os_groups_multiuser_{linux,darwin,freebsd,windows}.go` - OS group management per platform

Functions that exist in both engine variants must have matching signatures.

### Task environment management

- `pool` (*TaskEnvironmentPool) - manages pre-provisioned task environments
  - `TaskEnvironment` bundles `TaskDir`, `User`, and `PlatformData`
  - Engine-specific `TaskEnvironmentProvisioner` implementations create environments
  - `pool.Initialize()` before the main loop, `pool.Acquire()`/`pool.Release()` per task
  - `pool.Peek()` for pre-claim validation (GC, binary checks)
  - `pool.ActiveTaskDirNames()`/`pool.ActiveUserNames()` for purging old tasks
- `TaskRun.TaskDir` / `TaskRun.User` / `TaskRun.pd` - **per-task fields** set from acquired `TaskEnvironment`
  - Used by all task-execution code (features, commands, artifacts, mounts)

### Feature system

Features implement the `Feature` / `TaskFeature` interfaces:
- `Feature` is a singleton (one per worker lifetime)
- `TaskFeature` is created per task via `NewTaskFeature(task *TaskRun)`
- TaskFeature structs hold a `task *TaskRun` field for accessing per-task state

## Complete Validation Checklist

Before submitting a PR:

1. Run `go tool goimports -w workers/generic-worker/`
2. Cross-compile all 7 OS/tag variants (see Build Tags section)
3. Run tests: `go test -tags insecure -count 1 ./...`
4. Lint: `golangci-lint run --build-tags insecure --timeout=5m workers/generic-worker/...`
5. Lint: `golangci-lint run --build-tags multiuser --timeout=5m workers/generic-worker/...`
6. Run `yarn generate` (with Postgres running) and verify no unexpected changes
7. Run `bash build.sh -s` for full build verification
8. Add a changelog entry in `changelog/` (see `dev-docs/best-practices/changelog.md`)
