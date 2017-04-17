# The name of the executable.
BINARY = taskcluster

# Flags that are to be passed to the linker, can be overwritten by
# the environment or as an argument to make.
LDFLAGS ?=

SOURCEDIR = .
SOURCES := $(shell find $(SOURCEDIR) -name '*.go')

VERSION := $(shell git describe --always  --dirty --tags)
LDFLAGS += -X github.com/taskcluster/taskcluster-cli/cmds/version.VersionNumber=$(VERSION)

BUILD_ARCH ?= amd64 386
BUILD_OS ?= !netbsd !plan9

# Removing openbsd/386 because gopsutil can't cross compile for it yet.
# Removing darwin/386 until https://github.com/shirou/gopsutil/issues/348 is fixed
BUILD_OSARCH = !openbsd/386 !darwin/386

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

release: $(SOURCES)
	go get -u github.com/mitchellh/gox
	gox -os="${BUILD_OS}" -arch="${BUILD_ARCH}" -osarch="${BUILD_OSARCH}" -ldflags "${LDFLAGS}" -output="build/${BINARY}-{{.OS}}-{{.Arch}}" .

upload: _upload_release/upload
	_upload_release/upload -version $(VERSION) build/*

clean:
	rm -f ${BINARY}
	rm -rf build

test: prep build
	go test -v -race ./...

generate-apis:
	go get github.com/taskcluster/go-got
	go generate ./apis

lint: prep
	go get -u github.com/alecthomas/gometalinter
	gometalinter --install --force
	go install ./...
	gometalinter --vendor --disable-all --deadline 5m \
		--enable=golint \
		--enable=deadcode \
		--enable=staticcheck \
		--enable=misspell \
		--enable=vet \
		--enable=vetshadow \
		--enable=gosimple \
		--skip=apis --skip=vendor \
		./...

.PHONY: all prep build clean upload release generate-apis
