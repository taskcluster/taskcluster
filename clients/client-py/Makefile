VENV := .venv
PYTHON := $(VENV)/bin/python
APIS_JSON=$(PWD)/apis.json
UV := $(shell which uv)

.PHONY: test
test: devel
	$(UV) run pytest

.PHONY: lint
lint: devel
	$(UV) run ruff check taskcluster test

.PHONY: format
format: devel
	$(UV) run ruff format taskcluster test

.PHONY: update
update: docs

.PHONY: clean
clean:
	rm -rf .venv .tox htmlcov .coverage nosetests.xml
	rm -rf *.egg *.egg-info .eggs/ dist/ build/
	find . -name "*.py?" -exec rm {} +
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type d -name .hypothesis -exec rm -rf {} +

.PHONY: docs
docs: devel
	$(UV) run --with grip grip --export README.md
	@echo "Now, upload README.html wherever docs go!"

.PHONY: devel
devel:
	@if ! command -v uv >/dev/null 2>&1; then \
		echo "uv not found, installing..."; \
		curl -LsSf https://astral.sh/uv/install.sh | sh; \
	fi
	$(UV) sync --all-extras

.PHONY: install
install:
	$(UV) pip install -e .
