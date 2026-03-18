import assume from 'assume';
import subject from '../src/index.js';
import assert from 'node:assert';

suite('component loader', () => {
  test('should load a single component with a static value', async () => {
    const a = { a: 1 };

    const load = subject({
      test: { setup: () => a },
    });

    assume(await load('test')).equals(a);
  });

  test('should load a single component with setup function', async () => {
    const a = { a: 1 };

    const load = subject({
      test: {
        setup: () => {
          return a;
        },
      },
    });

    assume(await load('test')).equals(a);
  });

  test('should accept a virtual component', async () => {
    const a = { a: 1 };

    const load = subject(
      {
        test: {
          requires: ['dep'],
          setup: (deps) => {
            return deps.dep;
          },
        },
      },
      {
        dep: null,
      },
    );

    assume(
      await load('test', {
        dep: a,
      }),
    ).equals(a);
  });

  test('should accept a virtual component as array', async () => {
    const a = { a: 1 };

    const load = subject(
      {
        test: {
          requires: ['dep'],
          setup: (deps) => {
            return deps.dep;
          },
        },
      },
      ['dep'],
    );

    assume(
      await load('test', {
        dep: a,
      }),
    ).equals(a);
  });

  test('should allow setting defaults for virtual components', async () => {
    const load = subject(
      {
        test: {
          requires: ['dep'],
          setup: (deps) => {
            return deps.dep;
          },
        },
      },
      {
        dep: 5,
      },
    );

    assume(await load('test', {})).equals(5);
    assume(await load('test')).equals(5);
  });

  test('should allow overwrites', async () => {
    const load = subject(
      {
        test: {
          requires: [],
          setup: () => {
            return 'Hello World';
          },
        },
      },
      {},
    );

    assume(
      await load('test', {
        test: 'Mocking Hello World',
      }),
    ).equals('Mocking Hello World');
  });

  test('should forbid undefined components', async () => {
    try {
      subject({
        test: {
          requires: ['dep'],
          setup: (deps) => {
            return deps.dep;
          },
        },
      });
    } catch (_e) {
      return; // Ignore expected error
    }
    assert(false, 'Expected an error');
  });

  test('different loaders should have independent components', async () => {
    const components = {
      test: {
        setup: () => {
          return { a: 1 };
        },
      },
    };

    const loadA = subject(components);
    const loadB = subject(components);

    const valA = await loadA('test');
    const valB = await loadB('test');

    assume(valA).does.not.equal(valB);
  });

  test('should reinitialize components', async () => {
    const load = subject({
      test: {
        setup: () => {
          return { a: 1 };
        },
      },
    });

    assume(await load('test')).does.not.equal(await load('test'));
  });

  test('should load a simple dependency', async () => {
    const a = { a: 1 };
    let called = false;

    const load = subject({
      dep: {
        setup: () => {
          called = true;
          return a;
        },
      },
      base: {
        requires: ['dep'],
        setup: async (deps) => {
          assume(a).equal(deps.dep);
          return deps.dep;
        },
      },
    });

    assume(called).is.false();
    assume(await load('base')).equals(a);
    assume(called).is.true();
  });

  test('should fail loading a nonexistent component', async () => {
    const load = subject({
      base: {
        requires: [],
        setup: () => {},
      },
    });

    try {
      await load('does-not-exist');
    } catch (e) {
      if (!e.message.match(/is not defined/)) {
        throw e;
      }
      return; // Ignore expected error
    }
    assert(false, 'Expected an exception');
  });

  test('should fail when a sync setup function fails', async () => {
    const load = subject({
      fail: {
        requires: [],
        setup: () => {
          throw new Error('uhoh!');
        },
      },
    });

    try {
      await load('fail');
    } catch (e) {
      if (!e.message.match(/uhoh!/)) {
        throw e;
      }
      return; // Ignore expected error
    }
    assert(false, 'Expected an exception');
  });

  test('should fail when a setup function returns a rejected promise', async () => {
    const load = subject({
      fail: {
        requires: [],
        setup: () => Promise.reject(new Error('uhoh!')),
      },
    });

    try {
      await load('fail');
    } catch (e) {
      if (!e.message.match(/uhoh!/)) {
        throw e;
      }
      return; // Ignore expected error
    }
    assert(false, 'Expected an exception');
  });

  test('should fail when an async setup function fails', async () => {
    const load = subject({
      fail: {
        requires: [],
        setup: async () => {
          throw new Error('uhoh!');
        },
      },
    });

    try {
      await load('fail');
    } catch (e) {
      if (!e.message.match(/uhoh!/)) {
        throw e;
      }
      return; // Ignore expected error
    }
    assert(false, 'Expected an exception');
  });

  test('should detect and bail on cyclic dependency', async () => {
    try {
      subject({
        dep1: {
          requires: ['dep2'],
          setup: () => true,
        },
        dep2: {
          requires: ['dep3'],
          setup: () => true,
        },
        dep3: {
          requires: ['dep1'],
          setup: () => true,
        },
        base: {
          requires: ['dep1'],
          setup: () => true,
        },
      });
    } catch (e) {
      if (!e.message.match(/circular dependency/)) {
        throw e;
      }
      return;
    }
    assert(false, 'Expected an exception');
  });

  test('should load different types of static dependencies', async () => {
    const a = { a: 1 };
    const b = { b: 2 };
    const c = { c: 2 };
    const load = subject({
      string: { setup: () => 'a-string' },
      object: { setup: () => a },
      number: { setup: () => 123.456 },
      promise: { setup: () => Promise.resolve(b) },
      func: {
        setup: () => () => {
          return c;
        },
      },
      base: {
        requires: ['string', 'object', 'number', 'promise', 'func'],
        setup: async (deps) => {
          assume(await deps.string).equals('a-string');
          assume(await deps.object).equals(a);
          assume(await deps.number).equals(123.456);
          assume(await deps.promise).equals(b);
          assume((await deps.func).call()).equals(c);
        },
      },
    });

    await load('base');
  });

  test('should work with a complex dependency graph', async () => {
    const load = subject({
      dep1: {
        requires: ['dep2', 'dep3'],
        setup: () => true,
      },
      dep2: {
        requires: ['dep4'],
        setup: () => true,
      },
      dep3: {
        requires: ['dep4'],
        setup: () => true,
      },
      dep4: {
        requires: [],
        setup: () => true,
      },
      staticDep1: {
        setup: () => 'john',
      },
      base: {
        requires: ['dep1', 'staticDep1'],
        setup: async (deps) => {
          assume(await deps.staticDep1).equals('john');
          return true;
        },
      },
    });

    await load('base');
  });

  test('should fail when a virtual component is a dupe of a real one', () => {
    try {
      subject(
        {
          dep1: 'string',
        },
        {
          dep1: null,
        },
      );
    } catch (e) {
      if (!e.message.match(/virtual keys must not have definitions in the loader/)) {
        throw e;
      }
      return;
    }
    assert(false, 'Expected an error');
  });

  // We want to splatter bad component definitions against our component
  // validator
  const badDef = [
    ['def that is a string', 'this ought to fail'],
    ['def with non-func setup property', { setup: 'hi' }],
    ['def with missing setup property', {}],
    [
      'def with requires that is not array',
      {
        setup: () => {},
        requires: 'hi',
      },
    ],
    [
      'def with requires that is not array of only strings',
      {
        setup: () => {},
        requires: ['a', 1, 'b'],
      },
    ],
  ];
  for (const x of badDef) {
    test(`should fail on a ${x[0]}`, () => {
      try {
        subject({ a: x[1] });
        throw new Error();
      } catch (e) {
        if (!e.message.match(/^Invalid component definition:/)) {
          throw e;
        }
        return;
      }
    });
  }

  test('should handle sync vs async properly', async () => {
    const rv = { a: 1 };
    const orderCalled = [];
    const load = subject({
      dep1: {
        requires: ['dep2'],
        setup: (d) => {
          orderCalled.push('dep1');
          return new Promise((r) => {
            setTimeout(() => {
              r(d.dep2);
            }, 200);
          });
        },
      },
      dep2: {
        requires: ['dep3'],
        setup: (d) => {
          orderCalled.push('dep2');
          return d.dep3;
        },
      },
      dep3: {
        requires: ['dep4'],
        setup: (d) => {
          orderCalled.push('dep3');
          return new Promise((r) => {
            setTimeout(() => {
              r(d.dep4);
            }, 200);
          });
        },
      },
      dep4: {
        requires: [],
        setup: () => {
          orderCalled.push('dep4');
          return rv;
        },
      },
      base: {
        requires: ['dep1'],
        setup: (d) => {
          orderCalled.push('base');
          return d.dep1;
        },
      },
    });

    assume(await load('base', {})).equals(rv);
    assume(orderCalled).eql(['dep4', 'dep3', 'dep2', 'dep1', 'base']);
  });

  test("should fail when specified component didn't load", async () => {
    const load = subject({
      fail: {
        requires: [],
        setup: () => Promise.reject(new Error('uhoh!')),
      },
    });

    assert.throws(function () {
      load.crashOnError(true);
    }, 'false');
  });

  test('should pass own name to setup', async () => {
    const load = subject({
      testName: { setup: (_, ownName) => ownName },
    });

    assume(await load('testName')).equals('testName');
  });
});
