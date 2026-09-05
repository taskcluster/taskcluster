import assert from 'node:assert';
import { resolveNamedBindings, resolveRawBindings } from '../src/servers/resolveBindings.js';
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

  suite('raw', () => {
    test('returns the frame bindings, keeping only exchange and pattern', () => {
      const bindings = [{ exchange: 'exchange/foo/v1/bar', pattern: '#', routingKeyPattern: 'ignored' }];

      assert.deepEqual(resolveRawBindings({ bindings }), [{ exchange: 'exchange/foo/v1/bar', pattern: '#' }]);
    });

    test('rejects a missing or empty bindings array', () => {
      for (const bindings of [undefined, [], 'exchange/foo/v1/bar']) {
        assertProtocolError(() => {
          resolveRawBindings({ bindings });
        }, /non-empty array/);
      }
    });

    test('rejects bindings without an exchange and pattern string', () => {
      const bad = [null, 'exchange/foo/v1/bar', { exchange: 'exchange/foo/v1/bar' }, { exchange: 1, pattern: '#' }];

      for (const binding of bad) {
        assertProtocolError(() => {
          resolveRawBindings({ bindings: [binding] });
        }, /exchange.*pattern/);
      }
    });
  });

  suite('named', () => {
    const resolve = frame => resolveNamedBindings(frame, clients);

    test('expands event names via the queue events client', () => {
      const resolved = resolve({
        subscriptions: ['taskDefined', 'taskCompleted'],
        routingKey: { taskId: 'abc123' },
      });

      assert.equal(resolved.length, 2);
      assert.match(resolved[0].exchange, /task-defined/);
      assert.match(resolved[1].exchange, /task-completed/);

      for (const binding of resolved) {
        assert.match(binding.pattern, /abc123/);
      }
    });

    test('defaults to the queue service and wildcards an omitted routing key', () => {
      for (const routingKey of [undefined, null]) {
        const resolved = resolve({ subscriptions: ['taskDefined'], routingKey });

        assert.match(resolved[0].exchange, /task-defined/);
        assert.match(resolved[0].pattern, /[*#]/);
      }
    });

    test('rejects an unknown service', () => {
      assertProtocolError(() => {
        resolve({ service: 'nosuch', subscriptions: ['taskDefined'] });
      }, /unknown events service/);
    });

    test('rejects a missing or empty subscriptions array', () => {
      for (const subscriptions of [undefined, [], 'taskDefined']) {
        assertProtocolError(() => {
          resolve({ subscriptions });
        }, /non-empty array/);
      }
    });

    test('rejects unknown event names', () => {
      assertProtocolError(() => {
        resolve({ subscriptions: ['noSuchEvent'] });
      }, /unknown queue event/);
    });

    test('rejects non-event properties reachable on the client', () => {
      for (const subscriptions of [['constructor'], ['hasOwnProperty'], ['use'], ['buildUrl'], [null]]) {
        assertProtocolError(() => {
          resolve({ subscriptions });
        }, /unknown queue event/);
      }
    });

    test('rejects a routing key that is not an object of fields', () => {
      for (const routingKey of ['abc123', 42, ['abc123']]) {
        assertProtocolError(() => {
          resolve({ subscriptions: ['taskDefined'], routingKey });
        }, /routingKey must be an object/);
      }
    });

    test('rejects routing-key values the events client cannot encode', () => {
      for (const routingKey of [{ taskId: 'a.b' }, { taskId: {} }]) {
        assertProtocolError(() => {
          resolve({ subscriptions: ['taskDefined'], routingKey });
        }, /invalid routingKey for queue event taskDefined/);
      }
    });
  });
});
