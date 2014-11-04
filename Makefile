PEP8_IGNORE=E111,E121
PYTHON := python
VENV := env-$(basename $(PYTHON))
NODE_VER := v0.10.33
NODE_PLAT := $(shell uname | tr A-Z a-z)-x64
NODE_NAME := node-$(NODE_VER)-$(NODE_PLAT)
NODE_BIN := $(PWD)/$(NODE_NAME)/bin/node
NODE_URL := http://nodejs.org/dist/$(NODE_VER)/$(NODE_NAME).tar.gz
NODE_SRC := $(PWD)/node_sources
export NODE_PATH := $(PWD)/node_modules-$(NODE_VER)-$(NODE_PLAT)

.PHONY: test
test: $(VENV)/bin/python
	@# E111 -- I use two space indents, pep8 wants four
	@# E121 -- PEP8 doesn't like how I write dicts
	$(VENV)/bin/flake8 --ignore=$(PEP8_IGNORE) --max-line-length=120 taskcluster test
	$(VENV)/bin/python setup.py test
	$(VENV)/bin/nosetests

JS_CLIENT_BRANCH=master
APIS_JSON=$(PWD)/taskcluster/apis.json
APIS_JS_HREF=https://raw.githubusercontent.com/taskcluster/taskcluster-client/$(JS_CLIENT_BRANCH)/lib/apis.js

.PHONY: apis.json
update-api: $(NODE_BIN)
	@echo Downloading $(APIS_JS_HREF)
	curl -L -o $(NODE_SRC)/apis.js $(APIS_JS_HREF)
	OUTPUT=$(APIS_JSON) $(NODE_BIN) $(NODE_SRC)/translateApis.js
	@python -mjson.tool $(APIS_JSON) > /dev/null || echo "apis.json cannot be parsed by python's JSON"

$(VENV)/bin/python:
	[ -d $(VENV) ] || $(PYTHON) -m virtualenv $(VENV)
	$(VENV)/bin/python devDep.py
	$(VENV)/bin/python setup.py develop

.PHONY: dev-env
dev-env: $(VENV)/bin/python

.PHONY: clean
clean:
	find . -name "*.py?" -exec rm {} +
	rm -rf env-*

.PHONY: docs
docs:
	rm -rf docs/_build
	$(VENV)/bin/python -mpip install sphinx
	$(VENV)/bin/python makeRst.py > docs/client.rst
	make -C docs html SPHINXBUILD=$(abspath $(VENV)/bin/sphinx-build)

$(NODE_BIN):
	curl -LO $(NODE_URL)
	tar zxf node-$(NODE_VER)-$(NODE_PLAT).tar.gz

# For convenience
node: $(NODE_BIN)
	rm $@
	ln -s $(NODE_NAME) $@
