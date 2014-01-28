node_modules: package.json
	npm install

.PHONY: test
test:
	./node_modules/.bin/mocha $(wildcard *_test.js)

