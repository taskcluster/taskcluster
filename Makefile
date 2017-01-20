# The name of the executable.
BINARY = taskcluster

# Flags that are to be passed to the linker, can be overwritten by
# the environment or as an argument to make.
LDFLAGS ?= ""

SOURCEDIR = .
SOURCES := $(shell find $(SOURCEDIR) -name '*.go')

all: build

build: $(BINARY)

$(BINARY): $(SOURCES)
	go build -ldflags ${LDFLAGS} -o ${BINARY} .

clean:
	rm -f ${BINARY}

.PHONY: all build clean
