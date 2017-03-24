# The name of the executable.
BINARY = taskcluster

# Flags that are to be passed to the linker, can be overwritten by
# the environment or as an argument to make.
LDFLAGS ?=

SOURCEDIR = .
SOURCES := $(shell find $(SOURCEDIR) -name '*.go')

VERSION := $(shell git describe --always  --dirty --tags)
LDFLAGS += -X github.com/taskcluster/taskcluster-cli/cmds/version.VersionNumber=$(VERSION)

GOARCH := $(shell go env GOARCH)

all: prep build

prep:
	go get github.com/kardianos/govendor
	govendor sync

build: $(BINARY)

$(BINARY): $(SOURCES)
	go build -ldflags "${LDFLAGS}" -o ${BINARY} .

_upload_release/upload: _upload_release/upload.go
	go get ./_upload_release
	go build -o $@ ./_upload_release

upload: _upload_release/upload $(BINARY)
	_upload_release/upload -version $(VERSION) -arch $(GOARCH) -filename $(BINARY)

clean:
	rm -f ${BINARY}

.PHONY: all prep build clean upload
