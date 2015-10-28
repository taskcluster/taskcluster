suite("ScopeResolver (grantsRole)", () => {
  let ScopeResolver = require('../auth/scoperesolver');
  let assert        = require('assert');

  // Test cases for grantsRole
  [
    {
      // cases with *
      scope:    '*',
      role:     '*',
      result:   true
    }, {
      scope:    '*',
      role:     'client-id:queue',
      result:   true
    }, {
      scope:    '*',
      role:     'task-run-id:*',
      result:   true
    }, {
      // cases with as*
      scope:    'as*',
      role:     '*',
      result:   true
    }, {
      scope:    'as*',
      role:     'client-id:queue',
      result:   true
    }, {
      scope:    'as*',
      role:     'task-run-id:*',
      result:   true
    }, {
      scope:    'queue:*',
      role:     'task-run-id:*',
      result:   false
    }, {
      // cases with assume:*
      scope:    'assume:*',
      role:     'client-id:queue',
      result:   true
    }, {
      scope:    'assume:*',
      role:     'task-run-id:*',
      result:   true
    }, {
      scope:    'assume:*',
      role:     '*',
      result:   true
    }, {
      // cases with assume:<prefix>*
      scope:    'assume:client-id:*',
      role:     'client-id:queue',
      result:   true
    }, {
      scope:    'assume:task-run-id:*',
      role:     'task-run-id:*',
      result:   true
    }, {
      scope:    'assume:task-run-id:*',
      role:     '*',
      result:   true
    }, {
      scope:    'assume:task-run-id:*',
      role:     'task-run-*',
      result:   true
    }, {
      scope:    'assume:task-run-id:*',
      role:     'client-id:queue',
      result:   false
    }, {
      scope:    'assume:task-run-id:*',
      role:     'client-id:*',
      result:   false
    }, {
      // cases with assume:roleId
      scope:    'assume:client-id:queue',
      role:     'client-id:queue',
      result:   true
    }, {
      scope:    'assume:task-run-id:12345',
      role:     'task-run-id:72345',
      result:   false
    }, {
      scope:    'assume:task-run-id:12345',
      role:     'task-run-id:*',
      result:   true
    }, {
      scope:    'assume:task-run-id:12345',
      role:     '*',
      result:   true
    }, {
      scope:    'assume:task-run-id:12345',
      role:     'task-run-*',
      result:   true
    }, {
      scope:    'assume:task-run-id:12345',
      role:     'client-id:*',
      result:   false
    }, {
      scope:    'assume:a',
      role:     'a*',
      result:   true
    }, {
      scope:    'assume:a*',
      role:     'a*',
      result:   true
    }, {
      scope:    'assume:a*',
      role:     'a',
      result:   true
    }, {
      scope:    'assume:ab*',
      role:     'ac*',
      result:   false
    }
  ].forEach(({scope, role, result}) => {
    test(`grantsRole(${scope}, ${role}) === ${result}`, () => {
      assert(ScopeResolver.grantsRole(scope, role) === result,
             `Expected grantsRole(${scope}, ${role}) === ${result}`);;
    });
  });
});