CONFIG_FILE?=./deploy.json
TARGETS?=$(shell find template -type file | sed 's/template/target/')
DEPLOY_TAR?=deploy.tar.gz

$(DEPLOY_TAR): all
	tar cvfz $@ target/

all: $(TARGETS)

# Pick up changes when we update variables.js or configure.js
$(CONFIG_FILE): variables.js bin/configure.js
	./bin/configure $(CONFIG_FILE)

# Build the template files
# Note that $< is need here instead of $^ which would include the $CONFIG_FILE
# part of the statement in the invocation.
target/%: template/% $(CONFIG_FILE)
	./bin/build-template $(CONFIG_FILE) $< $@

.PHONY: clean
clean:
	rm -Rf target $(DEPLOY_TAR)
