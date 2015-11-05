#!/bin/bash -xveu

# call this script with -n to skip code generation

GENERATE=true
while getopts ":n" opt; do
    case "${opt}" in
        n)  GENERATE=false
            ;;  
    esac
done

cd "$(dirname "${0}")"
# uncomment if build.sh fails to build due to invalid generated code...
# for name in auth awsprovisioner{,events} index queue{,events} scheduler{,events} purgecache{,events} secrets
# do
#   git checkout -f "${name}/${name}.go"
# done

rm -rf "${GOPATH}/bin/generatemodel"
rm -rf "${GOPATH}"/pkg/*/github.com/*/taskcluster-client-go
go clean -i -x ./...

go get -t ./...
go install -v -x ./codegenerator/generatemodel
"${GENERATE}" && go generate -v ./...
go install -v -x ./...
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
[ $(git status --porcelain | wc -l) == 0 ]
