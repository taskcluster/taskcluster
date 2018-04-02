const assert = require('assert');
const {stickyLoader} = require('../');

suite('stickyLoader', function() {
  let loads, sticky;

  const loader = (component, overwrites) => {
    loads.push({component, overwrites: Object.keys(overwrites)});
    if (component in overwrites) {
      return overwrites[component];
    }
    return Promise.resolve({component});
  };

  setup(function() {
    loads = [];
    sticky = stickyLoader(loader);
  });

  test('returns same component twice', async function() {
    const first = await sticky('abc');
    const second = await sticky('abc');
    const third = await sticky('def');
    assert(first === second);
    assert(first !== third);
    assert(second !== third);
  });

  test('includes result in overwrites', async function() {
    const first = await sticky('abc');
    const second = await sticky('def');
    assert.deepEqual(loads, [{
      component: 'abc',
      overwrites: [],
    }, {
      component: 'def',
      overwrites: ['abc'],
    }]);
  });

  test('inject adds to overwrites', async function() {
    const first = await sticky.inject('inj', {inj: true});
    const second = await sticky('inj');
    assert.deepEqual(loads, [{
      component: 'inj',
      overwrites: ['inj'],
    }]);
  });

  test('reset resets', async function() {
    const first = await sticky('abc');
    const second = await sticky('def');
    sticky.reset();
    const third = await sticky('abc');
    assert.deepEqual(loads, [{
      component: 'abc',
      overwrites: [],
    }, {
      component: 'def',
      overwrites: ['abc'],
    }, {
      component: 'abc',
      overwrites: [],
    }]);
    assert(first !== third);
  });
});
