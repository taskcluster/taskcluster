TOX_ENV ?= py37
VENV := .tox/$(TOX_ENV)
PYTHON := $(VENV)/bin/python
APIS_JSON=$(PWD)/apis.json
TOX := tox

.PHONY: test
test: generate-classes devel
	$(TOX)

.PHONY: generate-classes
generate-classes: devel
	$(VENV)/bin/python genCode.py

.PHONY: update
update: update-api generate-classes update-readme docs

.PHONY: update-api
update-api: devel
	API_REF_OUT="$(APIS_JSON)" $(PYTHON) fetchApi.py
	@$(PYTHON) -mjson.tool $(APIS_JSON) > /dev/null || echo "apis.json cannot be parsed by python's JSON"

.PHONY: update-readme
update-readme: devel
	README_FILE=README.md APIS_JSON=$(APIS_JSON) $(PYTHON) genDocs.py

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
	$(PYTHON) -m pip install grip
	$(VENV)/bin/grip --export README.md
	@echo "Now, upload README.html wherever docs go!"

.PHONY: devel
devel:
	$(TOX) --develop --notest -e $(TOX_ENV)
	$(PYTHON) devDep.py
