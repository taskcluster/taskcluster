.PHONY: test all

GRAMMAR=lib/grammar.pegjs

all: lib/parser.js

lib/parser.js:
	./node_modules/pegjs/bin/pegjs $(GRAMMAR) $@

test: lib/parser.js
	./node_modules/.bin/mocha -R list -u tdd
