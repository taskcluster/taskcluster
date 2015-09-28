let assume = require('assume');
let subject = require('../lib/loader');

describe('component loader', function() {
  it('should load a single component with a static value', async function() {
    let a = {a: 1};

    let load = subject({
      test: a,
    })();

    assume(await load('test')).equals(a);
  });
  
  it('should load a single component with setup function', async function() {
    let a = {a: 1};

    let load = subject({
      test: {
        setup: () => {
          return a;
        }
      }
    })();

    assume(await load('test')).equals(a);
  });
  
  it('should load a virtual component', async function() {
    let a = {a: 1};

    let baseLoader = subject({
      test: {
        requires: ['dep'],
        setup: deps => {
          return deps.dep;
        }
      }
    }, ['dep']);
    
    let load = baseLoader({
      dep: {
        setup: () => {
          return a
        },
      },
    });

    assume(await load('test')).equals(a);
  });

  it('different loaders should have independent components', async function() {
    let components = {
      test: {
        setup: () => {
          return {a: 1};
        },
      },
    };

    let loadA = subject(components)();
    let loadB = subject(components)();

    let valA = await loadA('test');
    let valB = await loadB('test');

    assume(valA).does.not.equal(valB); 
  });
  
  it('should not reinitialize components', async function() {
    let load = subject({
      test: {
        setup: () => {
          return {a: 1};
        }
      }
    })();

    assume(await load('test')).equals(await load('test')); 
  });

  it('should load a simple dependency', async function() {
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
          assume(a).equal(await deps.dep);
          return deps.dep;
        }
      }
    })();

    assume(called).is.false();
    assume(await load('base')).equals(a);
    assume(called).is.true();
  });

  it('should load a simple virtual dependency', async function() {
    let a = {a: 1};
    let called = false;
    
    let baseLoader = subject({
      dep: {
        setup: () => {
          return 2;
        }
      },
      base: {
        requires: ['dep', 'dep2'],
        setup: async deps => {
          assume(a).equal(await deps.dep2);
          return deps.dep2;
        }
      }
    }, ['dep2']);

    assume(called).is.false();
    let load = baseLoader({
      dep2: {
        setup: () => {
          called = true;
          return a;
        },
      },
    });
    assume(await load('base')).equals(a);
    assume(called).is.true();
  });

  it('should detect and bail on cyclic dependency', async function() {
    let load = subject({
      dep1: {
        requires: ['dep2'],
        setup: () => {
          return true;
        }
      },
      dep2: {
        requires: ['dep3'],
        setup: () => {
          return true;
        }
      },
      dep3: {
        requires: ['dep1'],
        setup: () => {
          return true;
        }
      },
      base: {
        requires: ['dep1'],
        setup: () => {
          return true;
        }
      },
    })();

    try {
      await load('base');
      throw new Error('this should not work');
    } catch (e) {
      if (!e.message.match(/^Component dep1 is involved in a dependency cycle with \["base","dep1","dep2","dep3"\]$/)) {
        throw e;
      }
    }
  });

  it('should load different types of static dependencies', async function() {
    let a = {a: 1};
    let b = {b: 2};
    let c = {c: 2};
    let baseLoader = subject({
      string: 'a-string',
      object: a,
      number: 123.456,
      promise: new Promise(res => { res(b) }),
      func: () => { return c },
    }, ['base']);

    let load = baseLoader({
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

  it('should work with a complex dependency graph', async function() {
    let load = subject({
      dep1: {
        requires: ['dep2', 'dep3'],
        setup: () => {
          return true;
        }
      },
      dep2: {
        requires: ['dep4'],
        setup: () => {
          return true;
        }
      },
      dep3: {
        requires: ['dep4'],
        setup: () => {
          return true;
        }
      },
      dep4: {
        requires: [],
        setup: () => {
          return true;
        }
      },
      staticDep1: 'john',
      base: {
        requires: ['dep1', 'staticDep1'],
        setup: async deps => {
          assume(await deps.staticDep1).equals('john');
          return true;
        }
      },
    })();

    await load('base');
  });
});
