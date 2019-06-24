#!/bin/bash -euxv

# options:
#   -n  skip code generation
#   -d  update timestamp included in generated docs

cd "$(dirname "${0}")"

GO_VERSION="$(go version 2>/dev/null | cut -f3 -d' ')"
GO_MAJ="$(echo "${GO_VERSION}" | cut -f1 -d'.')"
GO_MIN="$(echo "${GO_VERSION}" | cut -f2 -d'.')"
if [ -z "${GO_VERSION}" ]; then
  echo "Have you installed go? I get no result from \`go version\` command." >&2
  exit 64
elif [ "${GO_MAJ}" != "go1" ] || [ "${GO_MIN}" -lt 8 ]; then
  echo "Go version go1.x needed, where x >= 8, but the version I found is: '${GO_VERSION}'" >&2
  echo "I found it here:" >&2
  which go >&2
  echo "The complete output of \`go version\` command is:" >&2
  go version >&2
  exit 65
fi

if [ -z "${TASKCLUSTER_ROOT_URL}" ]; then
  echo "Please export TASKCLUSTER_ROOT_URL to the cluster you wish to build the client for." >&2
  exit 66
fi

# in case build.sh was run with -d option since last build
git checkout -f codegenerator/model-data.txt
UNIX_TIMESTAMP="$(head -1 codegenerator/model-data.txt | sed -n 's/^Generated: //p')"

GENERATE=true
NEW_TIMESTAMP=false

while getopts ":nd" opt; do
    case "${opt}" in
        n)  GENERATE=false
            ;;
        d)  UNIX_TIMESTAMP=$(date +%s)
            echo "GENERATING NEW TIMESTAMP IN DOCS"
            NEW_TIMESTAMP=true
            ;;
    esac
done

export UNIX_TIMESTAMP
echo "GO_VERSION = '${GO_VERSION}'"
echo "UNIX_TIMESTAMP = '${UNIX_TIMESTAMP}'"
# having GOOS for anything than local system will break running the tests
unset GOOS

# remove any binaries built from any fork
rm -rf "${GOPATH}"/pkg/*/github.com/*/taskcluster-client-go
# remove any binaries from this fork
go clean -i ./...

# generate code
go get github.com/docopt/docopt-go
go get github.com/xeipuuv/gojsonschema
go get github.com/taskcluster/jsonschema2go/...
go get golang.org/x/tools/cmd/goimports
# rebuild codegenerator/model/types.go based on api-reference.json
##### TODO: check README.md examples still work
"${GENERATE}" && go generate ./...

# fetch deps/build/install taskcluster-client-go
go get -t -v ./...
go fmt ./...

go vet ./...

go get github.com/axw/gocov/gocov
go get github.com/pierrre/gotestcover
# since gotestcover can have 0 exit code even with failures, also run tests
# with go test
go test -v -race ./...
"${GOPATH}/bin/gotestcover" -v -coverprofile=coverage.report ./...
go tool cover -func=coverage.report

# Make sure no PANIC lines appear in model-data.txt
# See https://bugzilla.mozilla.org/show_bug.cgi?id=1221239
grep -q PANIC codegenerator/model-data.txt && exit 68

go get golang.org/x/lint/golint
"${GOPATH}/bin/golint" codegenerator/...; "${GOPATH}/bin/golint" integrationtest/...; "${GOPATH}/bin/golint" .

go get github.com/gordonklaus/ineffassign
"${GOPATH}/bin/ineffassign" .

echo
echo "Checking for any non-ideal type names..."
{
  grep -r '^\t[A-Z][a-zA-Z]*[1-9] ' .
  grep -r '^\tVar[1-9]*' .
  grep -r '^\t[A-Z][a-zA-Z0-9]*Entry' . | grep -v 'PurgeCacheRequestsEntry' # this name is intended
  grep -r 'Defined properties:$' .
} | grep -v '^Binary file' | grep 'types\.go' | grep -v 'codegenerator' | sort -u

echo
echo "Checking for json.RawMessage..."
{
  grep -r 'json\.RawMessage' . | grep -v '^Binary file'
} | grep 'types\.go' | grep -v 'codegenerator' | sort -u

# finally check that generated files have been committed, and that formatting
# code resulted in no changes...
echo
git status
"${NEW_TIMESTAMP}" || [ $(git status --porcelain | wc -l) == 0 ]
