#!/bin/bash -ve
# USAGE: Run this file using `npm test` from repository root

mocha \
    test/validate_test.js \
    test/api/createhook_test.js \
    test/api/triggerhook_test.js \
    ;
