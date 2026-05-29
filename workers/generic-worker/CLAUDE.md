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
# Note: the module version in the ldflags path changes with each major release.
# Check go.mod for the current version.
go test -tags insecure -count 1 -ldflags "-X github.com/taskcluster/taskcluster/v100/workers/generic-worker.revision=$(git rev-parse HEAD)" -v ./...

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
Note the syntax differs: `go build` uses `-X main.revision=...` while `go test` needs the full package path. The `build.sh` script handles this automatically.

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

Required when changing generic-worker schemas, exit codes, or payload definitions (generates `generated_*.go` files).
See the root [CLAUDE.md](/CLAUDE.md) for Postgres setup and `yarn generate` instructions.

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

### Task execution

- `taskContext` global holds the current task's `TaskDir` and `User`
- `PrepareTaskEnvironment()` / `RotateTaskEnvironment()` create and clean up
  task directories and OS users between tasks
- On multiuser, `PlatformTaskEnvironmentSetup()` creates the task user and
  grants them control of the task directory
- `TaskRun.pd` holds platform-specific process data for running commands as
  the task user

### Feature system

Features implement the `Feature` / `TaskFeature` interfaces:
- `Feature` is a singleton (one per worker lifetime)
- `TaskFeature` is created per task via `NewTaskFeature(task *TaskRun)`
- TaskFeature structs hold a `task *TaskRun` field for accessing per-task state

### Multiuser engine constraints

- The multiuser engine creates a restricted OS user per task. The task user can
  only write within their task directory (granted via `chown` on posix, `icacls`
  on Windows).
- Mount paths (file/directory/cache) can be relative (resolved against the task
  directory) or absolute. Absolute paths require the target to be writable by
  the task user.
- `CreateFileAsTaskUser` / `CreateDirAsTaskUser` run `generic-worker create-file`
  / `create-dir` subcommands as the task user. These will fail if the target
  location is not writable by the task user.
- `os.Chmod(0777)` works on posix but NOT on Windows — Windows ACLs are separate
  from POSIX permissions. On Windows, use `icacls <dir> /grant Everyone:(OI)(CI)F`
  or the existing `makeFileOrDirReadWritableForUser` helper.

### Mount system

- `WritableDirectoryCache` has separate `CacheName` (for scopes) and `Directory`
  (for mount path). Caches are moved to `config.CachesDir` during unmount and
  moved back into place during mount.
- Mount content is downloaded to the worker's `downloads/` dir, then copied to
  the target path. On multiuser, file creation at the target is done as the task
  user.
- `check-shasums.sh` / `check-shasums.ps1` from the
  [testrepo](https://github.com/taskcluster/testrepo/tree/master/generic-worker)
  verify SHA256 of mounted files at runtime inside the task.
- `checkSHA256(t, hex, path)` helper in `helper_test.go` verifies file integrity
  from Go test code.

### CI scopes and test caches

- CI client `project/taskcluster/generic-worker/taskcluster-ci` has limited scopes.
- Cache scopes are defined in the
  [community-tc-config](https://github.com/taskcluster/community-tc-config) repo
  at `config/projects/taskcluster.yml`.
- Available test cache scopes: `apple-cache`, `banana-cache`, `devtools-app`,
  `test-modifications`, `unknown-issuer-app-cache`.
- Adding new cache names requires a PR to the community-tc-config repo.

### Test helpers

- `testdataDir` = `filepath.Join(cwd, "testdata")` — use as the base for
  paths like `filepath.Join(testdataDir, "SampleArtifacts", ...)`.
- `worldWritableTempDir(t, pattern)` — creates a temp dir accessible by all
  users (uses Public folder via `FOLDERID_Public` on Windows, `/tmp` on posix).
  Includes automatic cleanup via `t.Cleanup`.
- `makeDirWorldWritable(t, dir)` — makes a directory writable by any user
  (posix: `chmod 0777`, Windows: `icacls ... /grant Everyone:(OI)(CI)F`).
- `incrementCounterInCacheDir(dir)` — runs a task command that increments a
  counter file inside the given cache directory. Used for testing cache
  persistence across tasks.

### Internal subcommands

Generic worker has several subcommands used internally by the multiuser engine:
- `generic-worker create-file --create-file <path>` — create a file as the task user
- `generic-worker create-dir --create-dir <path>` — create a directory as the task user
- `generic-worker copy-to-temp-file --copy-file <path>` — copy file to task user's temp dir
- `generic-worker unarchive --archive-src <src> --archive-dst <dst> --archive-fmt <fmt>` — extract archive

## Generic Worker Validation Checklist

In addition to the root [CLAUDE.md PR checklist](/CLAUDE.md#making-a-pull-request):

1. Cross-compile all 7 OS/tag variants (see Build Tags section)
2. Run tests: `go test -tags insecure -count 1 ./...`
3. Lint both engines: `golangci-lint run --build-tags insecure --timeout=5m workers/generic-worker/...` and `golangci-lint run --build-tags multiuser --timeout=5m workers/generic-worker/...`
4. Run `bash build.sh -s` for full build verification
