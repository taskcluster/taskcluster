.PHONY: test
test:
	./node_modules/.bin/mocha \
		$(wildcard *_test.js) \
		$(wildcard metrics/*_test.js) \
		$(wildcard test/*_test.js) \
		$(wildcard test/integration/*_test.js)
