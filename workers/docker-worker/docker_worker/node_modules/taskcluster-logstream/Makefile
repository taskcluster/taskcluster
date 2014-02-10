.PHONY: test
test: node_modules
	./node_modules/.bin/mocha \
		$(wildcard test/*_test.js) \
		$(wildcard *_test.js)

node_modules: package.json
	npm install
