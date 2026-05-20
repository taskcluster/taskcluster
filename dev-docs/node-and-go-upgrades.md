Taskcluster tries to use the LTS release of Node.js (see
[release schedule](https://nodejs.org/en/about/releases/)), and the latest
release of [Go](https://go.dev/). It may be a good idea to update these
after a Taskcluster release, to get some time with the update in
development environments before deploying new versions.

# Updating Node.js and Go

The easiest path is to run one of the dedicated upgrade commands from the
repository root:

```shell
yarn upgrade:node
yarn upgrade:go
```

By default, `yarn upgrade:node` fetches the latest Node.js LTS release and
uses `nvm` to install it. `yarn upgrade:go` fetches the latest stable Go
release, uses `gvm` to install it, and updates the pinned `golangci-lint`
version when the Go version changes. Both scripts add a changelog snippet for
the version bump.

These commands require `nvm` and `gvm` to be installed locally. The shell
wrappers load those tools, switch to the target runtime version, and then
delegate the repository updates to `infrastructure/tooling`.

To see the resolved versions and commands without changing the worktree or
installing tools:

```shell
yarn upgrade:node --dry-run
yarn upgrade:go --dry-run
```

To pin versions manually, pass explicit `major.minor.patch` versions. Node
versions may include a leading `v`; Go versions may include or omit the `go`
prefix:

```shell
yarn upgrade:node --node 24.15.0
yarn upgrade:go --go go1.26.2 --golangci-lint 2.11.2
```

`yarn upgrade:node` accepts these version selectors:

```shell
yarn upgrade:node --node latest
yarn upgrade:node --node 24.15.0
```

`yarn upgrade:go` accepts these version selectors:

```shell
yarn upgrade:go --go latest
yarn upgrade:go --go go1.26.2
yarn upgrade:go --go 1.26.2
```

The `--golangci-lint` option controls only the pinned version in
`.golangci-lint-version`; the script does not download a `golangci-lint`
binary. In `auto` mode, the pin is updated to the latest release when Go
changes and left alone otherwise.

```shell
yarn upgrade:go --golangci-lint auto
yarn upgrade:go --golangci-lint latest
yarn upgrade:go --golangci-lint skip
yarn upgrade:go --golangci-lint 2.11.2
```

If the working tree is dirty, the scripts ask before continuing. Pass `--yes`
to skip that prompt, for example when rerunning a partially completed upgrade.

# Updating node manually

Dependabot will open PRs for Node.js, but these will often fail since
additional steps are needed.

To update the node version:

* Install the new node version, such as `nvm install --lts`
* Enable [corepack](https://nodejs.org/api/corepack.html): `corepack enable`
* Update `package.json`
* Run `yarn generate`
* Run `yarn install`
* Run `yarn generate`
* Create a changelog file and commit
* Build and push new images (see below)

# Updating go manually

To update the go version:

* Install the new go version: `gvm install go1.26.3`
* Use the new go version (--default to set permanently): `gvm use go1.26.3`
* Download modules with `go mod download`
* Update `.go-version`
* Run `yarn generate`. Some `go` errors may occur, for example on major version updates.
* Run `go mod tidy`
* Run `go fmt ./...`
* Run `go tool goimports -w .`
* Run `yarn generate` again, should finish cleanly.
* Create a changelog file and commit
* Build and push new images (see below)

# Updating golangci-lint manually

If the Go upgrade requires a newer `golangci-lint`, update
`.golangci-lint-version`. CI uses this file to download the matching
`golangci-lint` release.

# Test
* Push the branch that updates Node.js and/or Go to GitHub, open a PR, and see
  if the tests pass.
