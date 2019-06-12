#!/bin/bash -exv

cd "$(dirname "${0}")"

# Support go 1 release 1.9 or higher. Let's not move this to 1.10 until
# https://bugzil.la/1441889 is resolved, and travis-ci.org works correctly with
# go 1.10 (currently, if you specify go 1.10, you get go 1.1).
GO_MAJOR_VERSION=1
MIN_GO_MINOR_VERSION=10

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
OUTPUT_ALL_PLATFORMS="Building just for the multiuser platform (build.sh -a argument NOT specified)"
OUTPUT_TEST="Test flag NOT detected (-t) as argument to build.sh script"
ALL_PLATFORMS=false
while getopts ":at" opt; do
    case "${opt}" in
        a)  ALL_PLATFORMS=true
            OUTPUT_ALL_PLATFORMS="Building for all platforms (build.sh -a argument specified)"
            ;;
        t)  TEST=true
            OUTPUT_TEST="Test flag detected (-t) as build.sh argument"
            ;;
    esac
done
echo "${OUTPUT_ALL_PLATFORMS}"
echo "${OUTPUT_TEST}"

go install github.com/taskcluster/generic-worker/gw-codegen
export PATH="$(go env GOPATH)/bin:${PATH}"
go generate ./...

function install {
  GOOS="${2}" GOARCH="${3}" CGO_ENABLED=0 go install -ldflags "-X main.revision=$(git rev-parse HEAD)" -tags "${1}" -v ./...
  # TODO: go vet currently broken on windows, although code itself seems safe and works
  if [ "${2}" != 'windows' ]; then
    GOOS="${2}" GOARCH="${3}" go vet -tags "${1}" ./...
  fi
  # note, this just builds tests, it doesn't run them!
  GOOS="${2}" GOARCH="${3}" CGO_ENABLED=0 go test -tags "${1}" -c github.com/taskcluster/generic-worker
  GOOS="${2}" GOARCH="${3}" CGO_ENABLED=0 go test -tags "${1}" -c github.com/taskcluster/generic-worker/livelog
  GOOS="${2}" GOARCH="${3}" CGO_ENABLED=0 go build -o generic-worker-${1}-${2}-${3} -ldflags "-X main.revision=$(git rev-parse HEAD)" -tags "${1}" -v .
}

if ${ALL_PLATFORMS}; then
  install docker linux amd64

  install multiuser windows amd64
  install multiuser windows 386

  install multiuser darwin amd64
  install multiuser darwin 386

  install simple darwin amd64
  install simple darwin 386

  install simple linux amd64
  install simple linux 386
  install simple linux arm
  install simple linux arm64
else
  MY_GOHOSTOS="$(go env GOHOSTOS)"
  MY_GOHOSTARCH="$(go env GOHOSTARCH)"
  case "${MY_GOHOSTOS}" in
      linux) install simple    "${MY_GOHOSTOS}" "${MY_GOHOSTARCH}"
             install docker    "${MY_GOHOSTOS}" "${MY_GOHOSTARCH}"
             ;;
     darwin) install simple    "${MY_GOHOSTOS}" "${MY_GOHOSTARCH}"
             install multiuser "${MY_GOHOSTOS}" "${MY_GOHOSTARCH}"
             ;;
    windows) install multiuser "${MY_GOHOSTOS}" "${MY_GOHOSTARCH}"
             ;;
  esac
fi

find "${GOPATH}/bin" -name 'generic-worker*'

CGO_ENABLED=0 go get github.com/taskcluster/livelog

if $TEST; then
  go get github.com/taskcluster/taskcluster-proxy
  CGO_ENABLED=1 GORACE="history_size=7" /usr/bin/sudo "GW_TESTS_RUN_AS_TASK_USER=true" "TASKCLUSTER_CERTIFICATE=$TASKCLUSTER_CERTIFICATE" "TASKCLUSTER_ACCESS_TOKEN=$TASKCLUSTER_ACCESS_TOKEN" "TASKCLUSTER_CLIENT_ID=$TASKCLUSTER_CLIENT_ID" "TASKCLUSTER_ROOT_URL=$TASKCLUSTER_ROOT_URL" go test -v -tags multiuser -ldflags "-X github.com/taskcluster/generic-worker.revision=$(git rev-parse HEAD)" -race -timeout 1h ./...
  if [ "$(go env GOHOSTOS)" == "linux" ]; then
    CGO_ENABLED=1 GORACE="history_size=7" go test -v -tags docker -ldflags "-X github.com/taskcluster/generic-worker.revision=$(git rev-parse HEAD)" -race -timeout 1h ./...
  fi
fi
go get golang.org/x/lint/golint
golint ./...
go get github.com/gordonklaus/ineffassign
ineffassign .

echo "Build successful!"
git status
