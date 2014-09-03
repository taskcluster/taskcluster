#!/bin/bash -ve
# USAGE: Run this file using `npm test` (must run from repository root)

mocha                                 \
  test/entity_test.js                 \
  test/config_test.js                 \
  test/validator_test.js              \
  test/api/publish_test.js            \
  test/api/auth_test.js               \
  test/api/route_test.js              \
  test/api/validate_test.js           \
  test/api/noncemanager_test.js       \
  test/api/responsetimer_test.js      \
  test/app_test.js                    \
  test/exchanges_test.js              \
  test/publisher_test.js              \
  test/stats_test.js                  \
  test/testing/localapp_test.js       \
  test/testing/localapp2_test.js      \
  test/testing/schemas_test.js        \
  test/testing/mockauthserver_test.js \
  ;
