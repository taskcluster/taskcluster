PYTHON := python
TOX_ENV ?= py35
VENV := .tox/$(TOX_ENV)

#   - sphinx version 1.5.1 (py3)
# pip3 install --user tox==2.5.0 flake8==3.2.1 sphinx==1.5.1 --user

.PHONY: test
test: generate-classes devel
	@echo "linting"
	FLAKE8=$(VENV)/bin/flake8 ./lint.sh
	@echo "linted, running unit tests"
	tox
	@echo "tested"

APIS_JSON=$(PWD)/apis.json

.PHONY: generate-classes
generate-classes: devel
	$(VENV)/bin/python genCode.py

.PHONY: update
update: update-api generate-classes update-readme docs

.PHONY: update-api
update-api: devel
	API_REF_OUT="$(APIS_JSON)" $(VENV)/bin/python fetchApi.py
	@python -mjson.tool $(APIS_JSON) > /dev/null || echo "apis.json cannot be parsed by python's JSON"

.PHONY: update-readme
update-readme: devel
	README_FILE=README.md APIS_JSON=$(APIS_JSON) $(VENV)/bin/python genDocs.py

.PHONY: clean
clean:
	if [ -f filescreated.dat ] ; then \
		for file in $$(cat filescreated.dat) ; do \
			git ls-files $$file --error-unmatch &> /dev/null ; \
			if [ $$? -eq 0 ] ; then \
			  git reset -- $$file &> /dev/null && git checkout -- $$file &> /dev/null ; \
			else \
			  rm $$file ; \
			fi \
		done \
	fi
	rm -rf filescreated.dat .tox htmlcov .coverage nosetests.xml
	rm -rf *.egg *.egg-info .eggs/ dist/ build/
	find . -name "*.py?" -exec rm {} +
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type d -name .hypothesis -exec rm -rf {} +

.PHONY: docs
docs: devel
	$(VENV)/bin/python -m pip install grip
	$(VENV)/bin/grip --export README.md
	@echo "Now, upload README.html wherever docs go!"

.PHONY: devel
devel:
	tox --develop --notest
	@set -e ; for env in $$(tox -l) ; do \
		echo installing dev deps for $${env} ; \
		.tox/$${env}/bin/python devDep.py ; \
	done
