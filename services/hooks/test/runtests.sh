#!/bin/bash
# USAGE: Run this file using `npm test` from repository root

mocha \
    test/*_test.js \
    test/api/*_test.js \
    ;
