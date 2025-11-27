#!/usr/bin/env bash
set -e

cd "$(dirname "${0}")"

####################################################################
# The next 3 lines are automatically edited by
#   infrastructure/tooling/src/generate/generators/go-version.js
#
# DO NOT CHANGE HERE!
####################################################################
# Support go 1.25 or higher.
GO_MAJOR_VERSION=1
MIN_GO_MINOR_VERSION=25

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
SKIP_CODE_GEN=false
while getopts ":atpso:" opt; do
    case "${opt}" in
        a)  ALL_PLATFORMS=true
            OUTPUT_ALL_PLATFORMS="Building for all platforms (build.sh -a argument specified)"
            ;;
        t)  TEST=true
            OUTPUT_TEST="Test flag detected (-t) as build.sh argument"
            ;;
        p)  PUBLISH=true
            ALL_PLATFORMS=true
            SKIP_CODE_GEN=true
            OUTPUT_ALL_PLATFORMS="Publishing (build.sh -p argument specified)"
            ;;
        o)  OUTPUT_DIR=$OPTARG
            ;;
        s)  SKIP_CODE_GEN=true
            echo "Skipping code generation (build.sh -s argument specified)"
    esac
done
echo "${OUTPUT_ALL_PLATFORMS}"
echo "${OUTPUT_TEST}"

if ! $SKIP_CODE_GEN; then
    go install ./gw-codegen
    export PATH="$(go env GOPATH)/bin:${PATH}"
    go generate ./...
fi

function install {
  if ! $PUBLISH; then
      GOOS="${2}" GOARCH="${3}" go vet -tags "${1}" ./...
      # note, this just builds tests, it doesn't run them!
      go list ./... | while read package; do
        GOOS="${2}" GOARCH="${3}" CGO_ENABLED=0 go test -tags "${1}" -c "${package}"
      done
  fi
  GOOS="${2}" GOARCH="${3}" CGO_ENABLED=0 go build -o "$OUTPUT_DIR/generic-worker-${1}-${2}-${3}" -ldflags "-X main.revision=${GIT_REVISION}" -tags "${1}" -v .
  # check that revision number made it into target binary
  if [ "${2}" == "$(go env GOHOSTOS)" ] && [ "${3}" == "$(go env GOHOSTARCH)" ]; then
    if ! "$OUTPUT_DIR/generic-worker-${1}-${2}-${3}" --version | \
    grep -qF "revision: https://github.com/taskcluster/taskcluster/commits/${GIT_REVISION}"; then
      echo "The --version option does not output a proper revision link"
      exit 1
    else
      # ANSI escape sequence for green tick
      echo -e "\x1b\x5b\x33\x32\x6d\xe2\x9c\x93\x1b\x5b\x30\x6d Revision number included in $OUTPUT_DIR/generic-worker-${1}-${2}-${3} (${GIT_REVISION})"
    fi
  fi
}

GIT_REVISION="$(git rev-parse HEAD)"

# NOTE: when changing this, also update
# ui/docs/reference/workers/generic-worker/support-tiers.mdx
if ${ALL_PLATFORMS}; then
  install multiuser windows amd64
  install multiuser windows arm64

  install multiuser darwin  amd64
  install multiuser darwin  arm64
  install insecure  darwin  amd64
  install insecure  darwin  arm64

  install multiuser linux   amd64
  install multiuser linux   arm64
  install insecure  linux   amd64
  install insecure  linux   arm64

  install multiuser freebsd amd64
  install multiuser freebsd arm64
  install insecure  freebsd amd64
  install insecure  freebsd arm64
else
  MY_GOHOSTOS="$(go env GOHOSTOS)"
  MY_GOHOSTARCH="$(go env GOHOSTARCH)"
  case "${MY_GOHOSTOS}" in
      linux) install insecure  "${MY_GOHOSTOS}" "${MY_GOHOSTARCH}"
             install multiuser "${MY_GOHOSTOS}" "${MY_GOHOSTARCH}"
             ;;
     darwin) install insecure  "${MY_GOHOSTOS}" "${MY_GOHOSTARCH}"
             install multiuser "${MY_GOHOSTOS}" "${MY_GOHOSTARCH}"
             ;;
    freebsd) install insecure  "${MY_GOHOSTOS}" "${MY_GOHOSTARCH}"
             install multiuser "${MY_GOHOSTOS}" "${MY_GOHOSTARCH}"
             ;;
    windows) install multiuser "${MY_GOHOSTOS}" "${MY_GOHOSTARCH}"
             ;;
  esac
fi

ls -1 "$OUTPUT_DIR"/generic-worker-*

proj_root=$(go list . | sed -e 's!/workers/generic-worker$!!' )
CGO_ENABLED=0 go install "${proj_root}/tools/livelog"
CGO_ENABLED=0 go install "${proj_root}/tools/taskcluster-proxy"
CGO_ENABLED=0 go install "${proj_root}/workers/generic-worker/resolvetask"

if $TEST; then
####################################################################
# The version number in this line is automatically updated by
#   infrastructure/tooling/src/release/tasks.js
# when a new major release is made.
####################################################################
  CGO_ENABLED=1 GORACE="history_size=7" go test -tags insecure -failfast -ldflags "-X github.com/taskcluster/taskcluster/v94/workers/generic-worker.revision=${GIT_REVISION}" -race -timeout 1h ./...
  go tool golint $(go list ./...) | sed "s*${PWD}/**"
  go tool ineffassign .
  go tool goimports -w .

fi

echo "Build successful!"
if ! $PUBLISH; then
    git status
fi
