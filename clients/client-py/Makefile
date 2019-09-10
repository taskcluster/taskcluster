TOX_ENV ?= py37
VENV := .tox/$(TOX_ENV)
PYTHON := $(VENV)/bin/python
APIS_JSON=$(PWD)/apis.json
TOX := $(shell which tox)

.PHONY: test
test: devel
	$(TOX)

.PHONY: update
update: docs

.PHONY: clean
clean:
	rm -rf .tox htmlcov .coverage nosetests.xml
	rm -rf *.egg *.egg-info .eggs/ dist/ build/
	find . -name "*.py?" -exec rm {} +
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type d -name .hypothesis -exec rm -rf {} +

.PHONY: docs
docs: devel
	$(PYTHON) -m pip install grip
	$(VENV)/bin/grip --export README.mdx
	@echo "Now, upload README.html wherever docs go!"

.PHONY: devel
devel:
	$(TOX) --develop --notest -e $(TOX_ENV)
	$(PYTHON) devDep.py
