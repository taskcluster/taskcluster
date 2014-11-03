PEP8_IGNORE=E111,E121
PYTHON := python
VENV := env-$(basename $(PYTHON))

.PHONY: test
test: $(VENV)/bin/python
	@# E111 -- I use two space indents, pep8 wants four
	@# E121 -- PEP8 doesn't like how I write dicts
	$(VENV)/bin/pep8 --ignore=$(PEP8_IGNORE) --max-line-length=120 taskcluster
	$(VENV)/bin/pep8 --ignore=$(PEP8_IGNORE) --max-line-length=120 test
	$(VENV)/bin/pyflakes taskcluster
	$(VENV)/bin/pyflakes test
	$(VENV)/bin/python setup.py test
	$(VENV)/bin/nosetests

JS_CLIENT_BRANCH=master
APIS_JSON=$(PWD)/taskcluster/apis.json
APIS_JS_HREF=https://raw.githubusercontent.com/taskcluster/taskcluster-client/master/lib/apis.js

.PHONY: apis.json
apis.json:
	@echo Downloading $(APIS_JS_HREF)
	curl -L -o apis.js $(APIS_JS_HREF)
	OUTPUT=$(APIS_JSON) node translateApis.js
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
