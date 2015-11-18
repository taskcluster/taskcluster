#!/bin/bash -xveu

# options:
#   -n  skip code generation
#   -d  don't change timestamp included in generated docs

cd "$(dirname "${0}")"

# in case build.sh was run with -d option since last build
git checkout -f codegenerator/model/model-data.txt
UNIX_TIMESTAMP="$(head -1 codegenerator/model/model-data.txt | sed -n 's/^Generated: //p')"

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

# uncomment if build.sh fails to build due to invalid generated code...
# for name in auth awsprovisioner{,events} hooks index queue{,events} scheduler{,events} purgecache{,events} secrets
# do
#   git checkout -f "${name}/${name}.go"
# done

rm -rf "${GOPATH}/bin/generatemodel"
rm -rf "${GOPATH}"/pkg/*/github.com/*/taskcluster-client-go
go clean -i -x ./...

go get ./codegenerator/generatemodel
"${GENERATE}" && go generate -v ./codegenerator/generatemodel
go get -t -v -x ./...
go fmt ./...

go get golang.org/x/tools/cmd/vet
go vet -x ./...

go get github.com/axw/gocov/gocov
go get golang.org/x/tools/cmd/cover
go get github.com/pierrre/gotestcover
"${GOPATH}/bin/gotestcover" -v -coverprofile=coverage.report ./...
go tool cover -func=coverage.report

# Make sure no PANIC lines appear in model-data.txt
# See https://bugzilla.mozilla.org/show_bug.cgi?id=1221239
grep -q PANIC codegenerator/model/model-data.txt && exit 68

# finally check that generated files have been committed, and that
# formatting code resulted in no changes...
git status
"${NEW_TIMESTAMP}" || [ $(git status --porcelain | wc -l) == 0 ]
