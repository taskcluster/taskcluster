suite('ScopeSetBuilder', () => {
  const assume = require('assume');
  const _ = require('lodash');
  const debug = require('debug')('test:scopesetbuilder');
  const {mergeScopeSets, scopeCompare} = require('taskcluster-lib-scopes');
  const ScopeSetBuilder = require('../src/scopesetbuilder');

  test('scopes()', () => {
    assume(new ScopeSetBuilder().scopes()).eql([]);
  });

  const testCases = [
    [],
    [
      [],
    ], [
      ['a', 'b', 'c'],
    ], [
      ['a'],
      ['b', 'c'],
    ], [
      ['a*'],
      ['a', 'b', 'c'],
    ], [
      ['a', 'b', 'c'],
      ['a_', 'b', 'c'],
      ['a*', 'b', 'c'],
      ['a', 'b', 'cc'],
      ['a', 'b', 'ccc*'],
      ['a', 'bbbb*', 'ccb'],
      ['a', 'bbb', 'c'],
      ['aaa', 'bb', 'c'],
      ['aa', 'bb', 'c'],
      ['a', 'bbbbbbc', 'dd'],
      ['a*', 'b', 'dd*'],
      ['a', 'bbb', 'd*'],
    ], [
      ['*'],
      ['a', 'b', 'c'],
      ['a_', 'b', 'c'],
      ['a*', 'b', 'c'],
    ], [
      ['abc*', 'w'],
      ['a', 'b', 'c'],
      ['a', 'ab', 'abc', 'abcd'],
      [],
      ['x', 'y*', 'z'],
      ['ttt', 'ttt*', 'tttttt', 'tx', 'ty*'],
    ], [
      ['^'],
      ['$'],
      ['_'],
      ['!'],
    ], [
      ['ab***'],
      ['ab**'],
    ],
  ].map(sets => sets.map(s => s.sort(scopeCompare)));

  testCases.forEach((sets, index) => test(`...add().scopes() (${index+1})`, () => {
    const builder = new ScopeSetBuilder();
    for (const s of sets) {
      builder.add(s);
    }
    assume(builder.scopes()).eql(sets.reduce(mergeScopeSets, []));
  }));

  testCases.forEach((sets, index) => test(`...add().scopes() shuffled (${index+1})`, () => {
    for (let i = 0; i < 100; i++) {
      const builder = new ScopeSetBuilder();
      for (const s of _.shuffle(sets)) {
        builder.add(s);
      }
      assume(builder.scopes()).eql(sets.reduce(mergeScopeSets, []));
    }
  }));

  testCases.forEach((sets, index) => test(`...add().scopes() optionallyClone (${index+1})`, () => {
    const builder = new ScopeSetBuilder({optionallyClone: true});
    for (const s of sets) {
      builder.add(s);
    }
    assume(builder.scopes()).eql(sets.reduce(mergeScopeSets, []));
  }));

  test('.scopes() optionallyClone: true', () => {
    const builder = new ScopeSetBuilder({optionallyClone: true});
    const sets = [['a', 'b', 'c'], [], []];
    for (const s of sets) {
      builder.add(s);
    }
    assume(sets[0] === builder.scopes()).is.true('expected to get the same object');
  });

  test('.scopes() optionallyClone: false', () => {
    const builder = new ScopeSetBuilder({optionallyClone: false});
    const sets = [['a', 'b', 'c'], [], []];
    for (const s of sets) {
      builder.add(s);
    }
    assume(sets[0] === builder.scopes()).is.false('expected to get a clone');
  });

  testCases.forEach((sets, index) => test(`normalizeScopeSet() shuffled (${index+1})`, () => {
    for (let i = 0; i < 100; i++) {
      const scopes = _.shuffle([].concat(...sets));
      assume(ScopeSetBuilder.normalizeScopeSet(scopes)).eql(sets.reduce(mergeScopeSets, []));
    }
  }));

  testCases.forEach((sets, index) => test(`mergeScopeSets() shuffled (${index+1})`, () => {
    for (let i = 0; i < 100; i++) {
      assume(_.shuffle(sets).reduce(ScopeSetBuilder.mergeScopeSets, [])).eql(sets.reduce(mergeScopeSets, []));
    }
  }));

  test('mergeScopeSets(A, [])', () => {
    const A = ['a', 'b', 'c'];
    assume(ScopeSetBuilder.mergeScopeSets(A, []) === A).is.true('expected to avoid cloning');
  });

  test('mergeScopeSets([], B)', () => {
    const B = ['a', 'b', 'c'];
    assume(ScopeSetBuilder.mergeScopeSets(B, []) === B).is.true('expected to avoid cloning');
  });
});
