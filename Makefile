PYTHON := python
TOX_ENV ?= py35
VENV := .tox/$(TOX_ENV)

.PHONY: test
test: $(VENV)/bin/python
	@echo "linting"
	$(VENV)/bin/flake8 --max-line-length=100 taskcluster test
	@echo "linted, running unit tests"
	$(VENV)/bin/tox
	@echo "tested"

APIS_JSON=$(PWD)/taskcluster/apis.json

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
