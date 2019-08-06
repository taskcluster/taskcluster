CONFIG_FILE?=./deploy.json
TARGETS?=$(shell find template -type f | sed 's/template/target/')
DEPLOY_TAR?=deploy.tar.gz


$(DEPLOY_TAR): all
	tar cvfz $@ target/

all: $(TARGETS)

packet: $(DEPLOY_TAR)
	-docker images -f "dangling=true" -q | xargs docker rmi -f
	bin/build-packet.sh

.PHONY: packet

# Build the template files
# Note that $< is need here instead of $^ which would include the $CONFIG_FILE
# part of the statement in the invocation.
target/%: template/% $(CONFIG_FILE)
	./bin/build-template $(CONFIG_FILE) $< $@

.PHONY: clean
clean:
	rm -Rf target $(DEPLOY_TAR)
