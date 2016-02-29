PYTHON := python
TOX_ENV ?= py35
VENV := .tox/$(TOX_ENV)

.PHONY: test
test: $(VENV)/bin/python
	FLAKE8=$(VENV)/bin/flake8 PYTHON=$(VENV)/bin/python \
	TOX=$(VENV)/bin/tox COVERAGE=$(VENV)/bin/coverage ./test.sh

JS_CLIENT_BRANCH=master
APIS_JSON=$(PWD)/taskcluster/apis.json
APIS_JS_HREF=https://raw.githubusercontent.com/taskcluster/taskcluster-client/$(JS_CLIENT_BRANCH)/lib/apis.js

.PHONY: update
update: update-api update-readme docs

.PHONY: update-api
update-api: $(VENV)/bin/python
	API_REF_OUT="$(APIS_JSON)" $(VENV)/bin/python fetchApi.py
	@python -mjson.tool $(APIS_JSON) > /dev/null || echo "apis.json cannot be parsed by python's JSON"

.PHONY: update-readme
update-readme: $(VENV)/bin/python
	README_FILE=README.md APIS_JSON=$(APIS_JSON) $(VENV)/bin/python genDocs.py

$(VENV)/bin/python:
	tox --notest
	$(VENV)/bin/pip install --upgrade setuptools
	$(VENV)/bin/python devDep.py
	$(VENV)/bin/python setup.py develop

.PHONY: dev-env
dev-env: $(VENV)/bin/python

.PHONY: clean
clean:
	rm -rf node-$(NODE_VER)-$(NODE_PLAT) node_modules
	rm -rf *.egg *.egg-info dist/
	find . -name "*.py?" -exec rm {} +
	rm -rf .tox htmlcov .coverage
	rm -rf env-*

.PHONY: docs
docs:
	rm -rf docs/_build
	$(VENV)/bin/python -mpip install sphinx
	$(VENV)/bin/python makeRst.py > docs/client.rst
	LC_CTYPE= make -C docs html SPHINXBUILD=$(abspath $(VENV)/bin/sphinx-build)

run_python: $(VENV)/bin/python
	$(VENV)/bin/python testscript.py
