.PHONY: test
test:
	pyflakes taskcluster
	pyflakes test
	$(VENV)/bin/python setup.py test

JS_CLIENT_BRANCH=master
APIS_JSON=$(PWD)/taskcluster/apis.json
APIS_JS_HREF=https://raw.githubusercontent.com/taskcluster/taskcluster-client/master/lib/apis.js

PYTHON := python
VENV := env-$(basename $(PYTHON))

.PHONY: apis.json
apis.json:
	@echo Downloading $(APIS_JS_HREF)
	curl -L -o $(APIS_JSON) $(APIS_JS_HREF)
	OUTPUT=$(APIS_JSON) node translateApis.js
	@python -mjson.tool $(APIS_JSON) > /dev/null || echo "apis.json cannot be parsed by python's JSON"

.PHONY: dev-env
dev-env:
	[ -d $(VENV) ] || $(PYTHON) -m virtualenv $(VENV)
	[ -d .pyhawk ] || git clone 'https://github.com/jhford/pyhawk' .pyhawk
	$(VENV)/bin/python devDep.py
	$(VENV)/bin/python setup.py develop

.PHONY: clean
clean:
	find . -name "*.py?" -exec rm {} +
	rm -rf env-*

.PHONY: docs
docs:
	rm -rf docs/_build
	python makeRst.py > docs/client.rst
	make -C docs html
