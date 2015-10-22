let assume = require('assume');
let subject = require('../lib/loader');
let debug = require('debug')('test:loader');
let assert = require('assert');

describe('component loader', () => {
  it('should load a single component with a static value', async () => {
    let a = {a: 1};

    let load = subject({
      test: {setup: () => a},
    });

    assume(await load('test')).equals(a);
  });
  
  it('should load a single component with setup function', async () => {
    let a = {a: 1};

    let load = subject({
      test: {
        setup: () => {
          return a;
        }
      }
    });

    assume(await load('test')).equals(a);
  });
  
  it('should accept a virtual component', async () => {
    let a = {a: 1};

    let load = subject({
      test: {
        requires: ['dep'],
        setup: deps => {
          return deps.dep;
        }
      }
    }, ['dep']);

    assume(await load('test', {
      dep: a
    })).equals(a);
  });

  it('should allow overwrites', async () => {
    let load = subject({
      test: {
        requires: [],
        setup: () => {
          return "Hello World";
        }
      }
    }, []);

    assume(await load('test', {
      test: 'Mocking Hello World'
    })).equals('Mocking Hello World');
  });

  it('should forbid undefined components', async () => {
    try {
      let load = subject({
        test: {
          requires: ['dep'],
          setup: deps => {
            return deps.dep;
          }
        }
      });
    } catch (e) {
      return; // Ignore expected error
    }
    assert(false, "Expected an error");
  });

  it('different loaders should have independent components', async () => {
    let components = {
      test: {
        setup: () => {
          return {a: 1};
        },
      },
    };

    let loadA = subject(components);
    let loadB = subject(components);

    let valA = await loadA('test');
    let valB = await loadB('test');

    assume(valA).does.not.equal(valB);
  });
  
  it('should reinitialize components', async () => {
    let load = subject({
      test: {
        setup: () => {
          return {a: 1};
        }
      }
    });

    assume(await load('test')).does.not.equal(await load('test'));
  });

  it('should load a simple dependency', async () => {
    let a = {a: 1};
    let called = false;
    
    let load = subject({
      dep: {
        setup: () => {
          called = true;
          return a;
        }
      },
      base: {
        requires: ['dep'],
        setup: async deps => {
          assume(a).equal(deps.dep);
          return deps.dep;
        }
      }
    });

    assume(called).is.false();
    assume(await load('base')).equals(a);
    assume(called).is.true();
  });


  it('should detect and bail on cyclic dependency', async () => {
    try {
      let load = subject({
        dep1: {
          requires: ['dep2'],
          setup: () => true
        },
        dep2: {
          requires: ['dep3'],
          setup: () => true
        },
        dep3: {
          requires: ['dep1'],
          setup: () => true
        },
        base: {
          requires: ['dep1'],
          setup: () => true
        },
      });
    } catch (e) {
      if (!e.message.match(/circular dependency/)) {
        throw e;
      }
      return;
    }
    assert(false, "Expected an exception");
  });

  it('should load different types of static dependencies', async () => {
    let a = {a: 1};
    let b = {b: 2};
    let c = {c: 2};
    let load = subject({
      string: {setup: () => 'a-string'},
      object: {setup: () => a},
      number: {setup: () => 123.456},
      promise: {setup: () => Promise.resolve(b)},
      func: {setup: ()=> () => { return c }},
      base: {
        requires: ['string', 'object', 'number', 'promise', 'func'],
        setup: async deps => {
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

  it('should work with a complex dependency graph', async () => {
    let load = subject({
      dep1: {
        requires: ['dep2', 'dep3'],
        setup: () => true
      },
      dep2: {
        requires: ['dep4'],
        setup: () => true
      },
      dep3: {
        requires: ['dep4'],
        setup: () => true
      },
      dep4: {
        requires: [],
        setup: () => true
      },
      staticDep1: {
        setup: () => 'john'
      },
      base: {
        requires: ['dep1', 'staticDep1'],
        setup: async deps => {
          assume(await deps.staticDep1).equals('john');
          return true;
        }
      },
    });

    await load('base');
  });
  
  it('should be able to build a graphviz file', async () => {
    let load = subject({
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
        setup: () => 'john'
      },
      base: {
        requires: ['dep1', 'staticDep1'],
        setup: async deps => {
          assume(await deps.staticDep1).equals('john');
          return true;
        }
      },
      otherBase: {
        requires: ['dep5', 'dep6'],
        setup: () => true,
      },
      dep5: {setup: () => true},
      dep6: {setup: () => true},
    });
    let expected = [
      '// This graph shows all dependencies for this loader.',
      '// You might find http://www.webgraphviz.com/ useful!',
      '',
      'digraph G {',
      '  "otherBase"',
      '  "otherBase" -> "dep5" [dir=back]',
      '  "otherBase" -> "dep6" [dir=back]',
      '  "dep6"',
      '  "dep5"',
      '  "base"',
      '  "base" -> "dep1" [dir=back]',
      '  "base" -> "staticDep1" [dir=back]',
      '  "staticDep1"',
      '  "dep1"',
      '  "dep1" -> "dep2" [dir=back]',
      '  "dep1" -> "dep3" [dir=back]',
      '  "dep3"',
      '  "dep3" -> "dep4" [dir=back]',
      '  "dep2"',
      '  "dep2" -> "dep4" [dir=back]',
      '  "dep4"',
      '}',
    ].join('\n');

    let graph = await load('graphviz');
    assume(expected).equal(graph);
  });

  it('should fail when a virtual component is a dupe of a real one', () => {
    try {
      let load = subject({
        dep1: 'string',
      }, ['dep1']);
      throw new Error();
    } catch (e) {
      if (!e.message.match(/assertation failure/)) {
        throw e;
      }
      return;
    }
    assert(false, "Expected an error");
  });

  // We want to splatter bad component definitions against our component
  // validator
  let badDef = [
    ['def that is a string', 'this ought to fail'],
    ['def with non-func setup property', { setup: 'hi' }],
    ['def with missing setup property', {}],
    ['def with requires that is not array', {
      setup: () => {},
      requires: 'hi',
    }],
    ['def with requires that is not array of only strings', {
      setup: () => {},
      requires: ['a', 1, 'b'],
    }],
  ];
  for (let x of badDef) {
    it('should fail on a ' + x[0], () => {
      try {
        subject({a: x[1]});
        throw new Error();
      } catch (e) {
        if (!e.message.match(/^Invalid component definition:/)) {
          throw e;
        }
        return;
      }
    });
  }

  it('should handle sync vs async properly', async () => {
    let rv = {a: 1};
    let orderCalled = [];
    let load = subject({
      dep1: {
        requires: ['dep2'],
        setup: d => {
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
        setup: d => {
          orderCalled.push('dep2');
          return d.dep3;
        },
      },
      dep3: {
        requires: ['dep4'],
        setup: d => {
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
        setup: d => {
          orderCalled.push('base');
          return d.dep1;
        }
      },

    });

    assume(await load('base', {})).equals(rv);
    assume(orderCalled).eql(['dep4', 'dep3', 'dep2', 'dep1', 'base']);
  });
});
