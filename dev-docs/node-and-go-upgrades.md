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
* Install yarn, such as `npm install -g yarn`
* Update `package.json`
* Run `yarn install`
* Run `yarn generate`
* Create a changelog file and commit
* Build and push new images (see below)

# Updating go

To update the go version:

* Install the new go version, such as `gvm install go1.18.3`
* Use the new go version, such as `gvm use go1.18.3`
* Download modules with `go mod download`
* Update `.go-version`
* Run `yarn generate`. Some `go` errors may occur, for example on major version updates.
* Run `go mod tidy`
* Run `go fmt ./...`
* Run `go install golang.org/x/tools/cmd/goimports@latest`
* Run `"$(go env GOPATH)/bin/goimports" -w .` (or non-bash equivalent)
* Run `yarn generate` again, should finish cleanly.
* Create a changelog file and commit
* Update the package hashes in `workers/generic-worker/gw-decision-task/tasks.yml`
  with the hashes on the [go downloads page](https://go.dev/dl/)
* If you update the `.golangci-lint-version` file, run `yarn generate` again
  and update the package hashes in `workers/generic-worker/gw-decision-task/tasks.yml`
  with the hashes on the `golangci-lint-<X.Y.Z>-checksums.txt` file from the
  [GitHub releases page](https://github.com/golangci/golangci-lint/releases)
* Build and push new images (see below)

# Build and push new images
When updating either npm or go, there are new Docker images that need to be
built and deployed to pass CI.

* Run `docker login` with credentials found on the [passwordstore](https://github.com/taskcluster/passwordstore-readme)
* Change to the `infrastructure/docker-images` folder
* (Optional) Run each builder:
  - `./build-browser-test.sh` - Uses node and Firefox ESR
  - `./build-ci-image.sh` - Uses node, go, and PostgreSQL
  - `./build-rabbit-test.sh` - Uses node
  - `./build-worker-ci.sh` - Uses node
* Push the images with `./push-all.sh`. This will also (re)build any images.
* Push the branch that updates Node.js and/or Go to GitHub, open a PR, and see
  if the tests pass.
