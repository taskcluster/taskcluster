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
rm -rf "${GOPATH}"/bin/{hack,generatemodel}
rm -rf "${GOPATH}"/pkg/*/github.com/*/taskcluster-client-go
"${GENERATE}" && rm -f client/generated-code.go
go clean ./...
go fmt ./...
# go get -v -u ./...
go install -v ./generatemodel
"${GENERATE}" && go generate -v ./...
go fmt ./...
go install -v ./...
