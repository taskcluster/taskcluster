#!/bin/bash -xveu

# options:
#   -n  skip code generation
#   -d  update timestamp included in generated docs

cd "$(dirname "${0}")"

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
echo "UNIX_TIMESTAMP = '${UNIX_TIMESTAMP}'"
# having GOOS for anything than local system will break running the tests
unset GOOS

rm -rf "${GOPATH}"/pkg/*/github.com/*/taskcluster-client-go
go clean -i -x ./...

# generate code
go get github.com/docopt/docopt-go
go get golang.org/x/tools/imports
go get github.com/xeipuuv/gojsonschema
"${GENERATE}" && go generate ./...

# fetch deps/build/install taskcluster-client-go
go get -t -v -x ./...
go fmt ./...

go get golang.org/x/tools/cmd/vet
go vet -x ./...

go get github.com/axw/gocov/gocov
go get golang.org/x/tools/cmd/cover
go get github.com/pierrre/gotestcover
# since gotestcover can have 0 exit code even with failures, also run tests
# with go test
go test -v ./...
"${GOPATH}/bin/gotestcover" -v -coverprofile=coverage.report ./...
go tool cover -func=coverage.report

# Make sure no PANIC lines appear in model-data.txt
# See https://bugzilla.mozilla.org/show_bug.cgi?id=1221239
grep -q PANIC codegenerator/model-data.txt && exit 68

# finally check that generated files have been committed, and that formatting
# code resulted in no changes...
git status
"${NEW_TIMESTAMP}" || [ $(git status --porcelain | wc -l) == 0 ]
