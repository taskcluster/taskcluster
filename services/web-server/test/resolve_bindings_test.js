import assert from 'node:assert';
import resolveBindings from '../src/servers/resolveBindings.js';
import clientFactory from '../src/clients.js';
import testing from '@taskcluster/lib-testing';

suite(testing.suiteName(), () => {
  const clients = clientFactory({ rootUrl: 'https://tc.example.com' });

  const assertProtocolError = (fn, messagePattern) => {
    assert.throws(fn, err => {
      assert.equal(err.code, 'ProtocolError');
      assert.match(err.message, messagePattern);

      return true;
    });
  };

  test('raw returns the frame bindings as-is', () => {
    const bindings = [{ exchange: 'exchange/foo/v1/bar', pattern: '#' }];

    assert.deepEqual(resolveBindings('raw', { bindings }, clients), bindings);
  });

  test('named expands event names via the queue events client', () => {
    const resolved = resolveBindings(
      'named',
      {
        subscriptions: ['taskDefined', 'taskCompleted'],
        routingKey: { taskId: 'abc123' },
      },
      clients
    );

    assert.equal(resolved.length, 2);
    assert.match(resolved[0].exchange, /task-defined/);
    assert.match(resolved[1].exchange, /task-completed/);

    for (const binding of resolved) {
      assert.match(binding.pattern, /abc123/);
    }
  });

  test('named defaults to the queue service and wildcards an omitted routing key', () => {
    const resolved = resolveBindings('named', { subscriptions: ['taskDefined'] }, clients);

    assert.match(resolved[0].exchange, /task-defined/);
    assert.match(resolved[0].pattern, /[*#]/);
  });

  test('named rejects an unknown service', () => {
    assertProtocolError(() => {
      resolveBindings('named', { service: 'nosuch', subscriptions: ['taskDefined'] }, clients);
    }, /unknown events service/);
  });

  test('named rejects a missing or empty subscriptions array', () => {
    for (const subscriptions of [undefined, [], 'taskDefined']) {
      assertProtocolError(() => {
        resolveBindings('named', { subscriptions }, clients);
      }, /non-empty array/);
    }
  });

  test('named rejects unknown event names', () => {
    assertProtocolError(() => {
      resolveBindings('named', { subscriptions: ['noSuchEvent'] }, clients);
    }, /unknown queue event/);
  });

  test('named rejects non-event properties reachable on the client', () => {
    for (const subscriptions of [['constructor'], ['hasOwnProperty'], [null]]) {
      assertProtocolError(() => {
        resolveBindings('named', { subscriptions }, clients);
      }, /unknown queue event/);
    }
  });

  test('an unknown endpoint kind is a server error, not a protocol error', () => {
    assert.throws(
      () => resolveBindings('nosuch', {}, clients),
      err => err.code !== 'ProtocolError'
    );
  });
});
