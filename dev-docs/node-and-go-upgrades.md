Taskcluster tries to use the LTS release of Node.js (see
[release schedule](https://nodejs.org/en/about/releases/)), and the latest
release of [Go](https://go.dev/). It may be a good idea to update these
after a Taskcluster release, to get some time with the update in
development environments before deploying new versions.

# Updating node

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

# Updating go

To update the go version:

* Install the new go version: `gvm install go1.25.4`
* Use the new go version (--default to set permanently): `gvm use go1.25.4`
* Download modules with `go mod download`
* Update `.go-version`
* Run `yarn generate`. Some `go` errors may occur, for example on major version updates.
* Run `go mod tidy`
* Run `go fmt ./...`
* Run `go tool goimports -w .`
* Run `yarn generate` again, should finish cleanly.
* Create a changelog file and commit
* Build and push new images (see below)

# Test
* Push the branch that updates Node.js and/or Go to GitHub, open a PR, and see
  if the tests pass.
