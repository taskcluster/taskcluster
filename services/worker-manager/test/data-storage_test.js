
const sinon = require('sinon');
const assume = require('assume');
const {BaseDatastore, InMemoryDatastore} = require('../lib/data-storage');

suite('Base Datastore', () => {
  const sandbox = sinon.createSandbox();

  let ds;

  setup(() => {
    ds = new BaseDatastore({id: 'test-ds'});
  });

  test('should allow get/set/has/delete functions', async () => {
    let value = {a: {b: {c: 'd'}}};
    let mock = sandbox.mock(ds);
    mock.expects('_has')
      .withArgs('ns', 'k')
      .thrice()
      .onFirstCall().returns(false)
      .onSecondCall().returns(true)
      .onThirdCall().returns(false);
    mock.expects('_list')
      .withArgs('ns')
      .thrice()
      .onFirstCall().returns([])
      .onSecondCall().returns(['k'])
      .onThirdCall().returns([]);
    mock.expects('_get')
      .twice()
      .withArgs('ns', 'k')
      .returns(value);
    mock.expects('_set')
      .once()
      .withArgs('ns', 'k', value)
      .returns();
    mock.expects('_delete')
      .withArgs('ns', 'k')
      .once()
      .returns();
    assume(await ds.has('ns', 'k')).is.not.ok();
    assume(await ds.list('ns')).deeply.equals([]);
    await ds.set('ns', 'k', value);
    assume(await ds.has('ns', 'k')).is.ok();
    assume(await ds.list('ns')).deeply.equals(['k']);
    assume(await ds.get('ns', 'k')).deeply.equals(value);
    // Ensure that the reference to value here is severed
    value.a.b.c = 'e';
    assume(await ds.get('ns', 'k')).deeply.equals(value);
    await ds.delete('ns', 'k');
    assume(await ds.has('ns', 'k')).is.not.ok();
    assume(await ds.list('ns')).deeply.equals([]);
    mock.verify();
  });

  suiteTeardown(() => {
    sandbox.restore();
  });
});

suite('In Memory Datastore', () => {
  let ds;

  setup(() => {
    ds = new InMemoryDatastore({id: 'test-ds'});
  });

  test('should allow get/set/has/delete functions', async () => {
    assume(await ds.has('ns', 'k')).is.not.ok();
    await ds.set('ns', 'k', 'v');
    assume(await ds.has('ns', 'k')).is.ok();
    assume(await ds.get('ns', 'k')).equals('v');
    assume(await ds.list('ns')).deeply.equals(['k']);
    await ds.delete('ns', 'k');
    assume(await ds.has('ns', 'k')).is.not.ok();
  });
});
