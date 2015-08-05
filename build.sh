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
# for name in auth awsprovisioner{,events} index queue{,events} scheduler{,events}
# do
#   git checkout -f "${name}/${name}.go"
# done

rm -rf "${GOPATH}/bin/generatemodel"
rm -rf "${GOPATH}"/pkg/*/github.com/*/taskcluster-client-go
go clean -i -x ./...

go get ./...
go install -v -x ./codegenerator/generatemodel
"${GENERATE}" && go generate -v ./...
go install -v -x ./...
go fmt ./...
go vet -x ./...
"${GOPATH}/bin/gotestcover" -v -coverprofile=coverage.report ./...
go tool cover -func=coverage.report

# finally check that generated files have been committed, and that
# formatting code resulted in no changes...
git status
[ $(git status --porcelain | wc -l) == 0 ]
