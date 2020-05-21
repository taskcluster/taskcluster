#!/bin/bash -e

cd "$(dirname "${0}")"

# Support go 1.13 or higher.
GO_MAJOR_VERSION=1
MIN_GO_MINOR_VERSION=13

unset CGO_ENABLED
unset GOOS
GO_VERSION="$(go version 2>/dev/null | cut -f3 -d' ')"
GO_MAJ="$(echo "${GO_VERSION}" | cut -f1 -d'.')"
GO_MIN="$(echo "${GO_VERSION}" | cut -f2 -d'.')"
if [ -z "${GO_VERSION}" ]; then
  echo "Have you installed go? I get no result from \`go version\` command." >&2
  exit 64
elif [ "${GO_MAJ}" != "go${GO_MAJOR_VERSION}" ] || [ "${GO_MIN}" -lt "${MIN_GO_MINOR_VERSION}" ]; then
  echo "Go version go${GO_MAJOR_VERSION}.x needed, where x >= ${MIN_GO_MINOR_VERSION}, but the version I found is: '${GO_VERSION}'" >&2
  echo "I found it here:" >&2
  which go >&2
  echo "The complete output of \`go version\` command is:" >&2
  go version >&2
  exit 65
fi
echo "Go version ok (${GO_VERSION} >= go${GO_MAJOR_VERSION}.${MIN_GO_MINOR_VERSION})"
TEST=false
PUBLISH=false
OUTPUT_ALL_PLATFORMS="Building just for the multiuser platform (build.sh -a argument NOT specified)"
OUTPUT_TEST="Test flag NOT detected (-t) as argument to build.sh script"
OUTPUT_DIR=.
ALL_PLATFORMS=false
while getopts ":atpo:" opt; do
    case "${opt}" in
        a)  ALL_PLATFORMS=true
            OUTPUT_ALL_PLATFORMS="Building for all platforms (build.sh -a argument specified)"
            ;;
        t)  TEST=true
            OUTPUT_TEST="Test flag detected (-t) as build.sh argument"
            ;;
        p)  PUBLISH=true
            ALL_PLATFORMS=true
            OUTPUT_ALL_PLATFORMS="Skipping code generation (build.sh -p argument specified)"
            ;;
        o)  OUTPUT_DIR=$OPTARG
            ;;
    esac
done
echo "${OUTPUT_ALL_PLATFORMS}"
echo "${OUTPUT_TEST}"

if ! $PUBLISH; then
    go install ./gw-codegen
    export PATH="$(go env GOPATH)/bin:${PATH}"
    go generate ./...
fi

function install {
  if ! $PUBLISH; then
      GOOS="${2}" GOARCH="${3}" CGO_ENABLED=0 go install -ldflags "-X main.revision=$(git rev-parse HEAD)" -tags "${1}" -v ./...
      GOOS="${2}" GOARCH="${3}" go vet -tags "${1}" ./...
      # note, this just builds tests, it doesn't run them!
      GOOS="${2}" GOARCH="${3}" CGO_ENABLED=0 go test -tags "${1}" -c .
      GOOS="${2}" GOARCH="${3}" CGO_ENABLED=0 go test -tags "${1}" -c ./livelog
  fi
  GOOS="${2}" GOARCH="${3}" CGO_ENABLED=0 go build -o "$OUTPUT_DIR/generic-worker-${1}-${2}-${3}" -ldflags "-X main.revision=$(git rev-parse HEAD)" -tags "${1}" -v .
}

# NOTE: when changing this, also update
# ui/docs/reference/workers/generic-worker/support-tiers.mdx
if ${ALL_PLATFORMS}; then
  install multiuser windows amd64
  install multiuser windows 386

  install multiuser darwin  amd64
  install simple    darwin  amd64

  install multiuser linux   amd64
  install docker    linux   amd64
  install simple    linux   amd64
  install simple    linux   arm
  install simple    linux   arm64
else
  MY_GOHOSTOS="$(go env GOHOSTOS)"
  MY_GOHOSTARCH="$(go env GOHOSTARCH)"
  case "${MY_GOHOSTOS}" in
      linux) install simple    "${MY_GOHOSTOS}" "${MY_GOHOSTARCH}"
             install multiuser "${MY_GOHOSTOS}" "${MY_GOHOSTARCH}"
             install docker    "${MY_GOHOSTOS}" "${MY_GOHOSTARCH}"
             ;;
     darwin) install simple    "${MY_GOHOSTOS}" "${MY_GOHOSTARCH}"
             install multiuser "${MY_GOHOSTOS}" "${MY_GOHOSTARCH}"
             ;;
     freebsd) install simple    "${MY_GOHOSTOS}" "${MY_GOHOSTARCH}"
             ;;
    windows) install multiuser "${MY_GOHOSTOS}" "${MY_GOHOSTARCH}"
             ;;
  esac
fi

ls -1 "$OUTPUT_DIR"/generic-worker-*

CGO_ENABLED=0 go get github.com/taskcluster/livelog

if $TEST; then
  go get github.com/taskcluster/taskcluster/v30/tools/taskcluster-proxy
  CGO_ENABLED=1 GORACE="history_size=7" /usr/bin/sudo "GOPATH=$GOPATH" "GW_TESTS_RUN_AS_CURRENT_USER=" "TASKCLUSTER_CERTIFICATE=$TASKCLUSTER_CERTIFICATE" "TASKCLUSTER_ACCESS_TOKEN=$TASKCLUSTER_ACCESS_TOKEN" "TASKCLUSTER_CLIENT_ID=$TASKCLUSTER_CLIENT_ID" "TASKCLUSTER_ROOT_URL=$TASKCLUSTER_ROOT_URL" $(which go) test -v -tags multiuser -ldflags "-X github.com/taskcluster/taskcluster/v30/workers/generic-worker.revision=$(git rev-parse HEAD)" -race -timeout 1h ./...
  MYGOHOSTOS="$(go env GOHOSTOS)"
  if [ "${MYGOHOSTOS}" == "linux" ] || [ "${MYGOHOSTOS}" == "darwin" ]; then
    CGO_ENABLED=1 GORACE="history_size=7" go test -v -tags docker -ldflags "-X github.com/taskcluster/taskcluster/v30/workers/generic-worker.revision=$(git rev-parse HEAD)" -race -timeout 1h ./...
  fi
  go get golang.org/x/lint/golint
  golint $(go list ./...) | sed "s*${PWD}/**"
  go get github.com/gordonklaus/ineffassign
  ineffassign .
  go get golang.org/x/tools/cmd/goimports

  # We should uncomment this goimports command once either we no longer have
  # ciruclar go module dependencies that cause an older version of
  # github.com/taskcluster/taskcluster module to be a dependency, or when
  # goimports no longer favours the older version over the newer.

  # goimports -w .

fi

go mod tidy

echo "Build successful!"
if ! $PUBLISH; then
    git status
fi
