const _ = require('lodash');
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

  test('cfg fails if cfg is not loaded', async function() {
    try {
      sticky.cfg('app.secret', 'donttell');
    } catch (e) {
      assert(e.toString().match(/AssertionError/), `got ${e}`);
      return;
    }
    assert(false, 'expected error');
  });

  test('cfg', async function() {
    sticky.inject('cfg', {});
    sticky.cfg('a.b.c', 'd');
    assert(_.isEqual(await sticky('cfg'), {a: {b: {c: 'd'}}}));
  });

  test('save/restore', async function() {
    const first = await sticky('abc');
    sticky.save();
    const second = await sticky('def');
    assert(await sticky('abc') === first, 'abc should be the same object');
    (await sticky('abc')).updated = true;
    sticky.restore();
    assert(await sticky('def') !== second, 'def should be a different object');
    assert((await sticky('abc')).updated, 'in-place modification to abc persists');
  });

  test('save/restore with inject', async function() {
    sticky.inject('abc', 'AAA');
    sticky.save();
    sticky.inject('abc', 'BBB');
    assert(await sticky('abc') === 'BBB', 'should get the updated injected value');
    sticky.restore();
    assert(await sticky('abc') === 'AAA', 'should get the original injected value');
  });

  test('save/restore with remove', async function() {
    sticky.inject('abc', 'AAA');
    sticky.save();
    sticky.remove('abc');
    assert(_.isEqual(await sticky('abc'), {component: 'abc'}), 'should load abc from loader');
    sticky.restore();
    assert(await sticky('abc') === 'AAA', 'should get the original injected value');
  });

  test('save/restore with cfg', async function() {
    sticky.inject('cfg', {});
    sticky.cfg('app.secret', 'donttell');
    assert((await sticky('cfg')).app.secret === 'donttell');
    sticky.save();
    assert((await sticky('cfg')).app.secret === 'donttell');
    sticky.cfg('app.secret', 'Fae9ce3z');
    assert((await sticky('cfg')).app.secret === 'Fae9ce3z');
    sticky.restore();
    assert((await sticky('cfg')).app.secret === 'donttell');
  });
});
