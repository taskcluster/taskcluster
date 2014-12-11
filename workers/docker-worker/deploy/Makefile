CONFIG_FILE?=./deploy.json
TARGETS?=$(shell find template -type file | sed 's/template/target/')
DEPLOY_TAR?=deploy.tar.gz
PRIVATE_KEY?=$(shell ./bin/resolve_path_in_config $(CONFIG_FILE) privateKeyLocation)

$(DEPLOY_TAR): all
	tar cvfz $@ target/
	rm target/etc/$(shell basename $(PRIVATE_KEY))

all: $(TARGETS) private_key

# Pick up changes when we update variables.js or configure.js
$(CONFIG_FILE): variables.js bin/configure.js
	./bin/configure $(CONFIG_FILE)

# Build the template files
# Note that $< is need here instead of $^ which would include the $CONFIG_FILE
# part of the statement in the invocation.
target/%: template/% $(CONFIG_FILE)
	./bin/build-template $(CONFIG_FILE) $< $@

# Copy private key so it's included in the deployment files.
# Marked as phony target because full file location is not known until the
# configuration file is built.
.PHONY: private_key
private_key: $(CONFIG_FILE)
	test -f $(PRIVATE_KEY)
	mkdir -p target/etc/
	cp $(PRIVATE_KEY) target/etc/

.PHONY: clean
clean:
	rm -Rf target $(DEPLOY_TAR)
