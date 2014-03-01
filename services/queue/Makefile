.PHONY: test
test:
	./node_modules/.bin/nodeunit $(wildcard tests/**/*.js)

.PHONY: ci
ci:
	# XXX: enable tests/api/index.js once it can be mocked OR we add s3 test only
	# creds for CI
	./node_modules/.bin/nodeunit \
		tests/events/index.js \
		tests/queue/data.js \
		tests/validation/index.js

