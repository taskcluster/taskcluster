const assume = require('assume');
const _ = require('lodash');
/* eslint-disable quote-props */

/** Test cases for use in trie_test.js */
const testcases = [
  {
    title: 'simple',
    rules: [
      {pattern: 'a',    scopes: ['A']},
      {pattern: 'b',    scopes: ['B', 'C']},
    ],
    // indicates that results are not dependent on indirect scope grants
    hasIndirctResults: false, // defaults to true
    results: {
      'a':        ['A'],
      'b':        ['B', 'C'],
      'c':        [],
      '*':        ['A', 'B', 'C'],
    },
  }, {
    title: 'parameterized direct',
    rules: [
      {pattern: 'a',    scopes: ['A']},
      {pattern: 'b',    scopes: ['B', 'C']},
      {pattern: 'c*',   scopes: ['C']},
      {pattern: 'd*',   scopes: ['D<..>']},
      {pattern: 'e*',   scopes: ['E<..>F']},
    ],
    hasIndirctResults: false,
    results: {
      'a':        ['A'],
      'b':        ['B', 'C'],
      'c':        ['C'],
      'cccc':     ['C'],
      'cX':       ['C'],
      'c*':       ['C'],
      'dX':       ['DX'],
      'dXYZ':     ['DXYZ'],
      'd*':       ['D*'],
      'dXY*':     ['DXY*'],
      'eX':       ['EXF'],
      'eXYZ':     ['EXYZF'],
      'e*':       ['E*'],
      'eXY*':     ['EXY*'],
      'q':        [],
      '*':        ['A', 'B', 'C', 'D*', 'E*'],
    },
  }, {
    title: 'star',
    rules: [
      {pattern: 'a*a',  scopes: ['A']},
    ],
    hasIndirctResults: false,
    results: {
      'a':        [],
      'a*':       ['A'],
      'a*a':      ['A'],
      'a*a*':     ['A'],
      'a*aa*':    [],
      'b':        [],
      '':         [],
      '*':        ['A'],
    },
  }, {
    title: 'parameterized indirect',
    rules: [
      {pattern: 'a:*',  scopes: ['q<..>']},
      {pattern: 'a',    scopes: ['b']},
      {pattern: 'b',    scopes: ['cc', 'eX*']},
      {pattern: 'c*',   scopes: ['dYY']},
      {pattern: 'd*',   scopes: ['eZZZ']},
      {pattern: 'e*',   scopes: ['f<..>g']},
      {pattern: 'ff*',  scopes: ['h<..>j*']},
      {pattern: 'hej',  scopes: ['hello']},
      {pattern: 'hej2', scopes: ['hello2']},
      {pattern: 'h*',   scopes: ['H']},
      {pattern: 'q*',   scopes: ['Q']},
    ],
    results: {
      'a':        ['b', 'cc', 'dYY', 'eZZZ', 'fZZZg', 'eX*', 'fX*'],
      'aa':       [],
      'a:a':      ['qa', 'Q'],
      'a:aa':     ['qaa', 'Q'],
      'z':        [],
      'eU*':      ['fU*'],
      'e*':       ['f*', 'h*', 'hello', 'hello2', 'H'],
      'e123':     ['f123g'],
      'eU':       ['fUg'],
      'hej':      ['hello', 'H'],
      'hej2':     ['hello2', 'H'],
      'hh':       ['H'],
      'efy':      ['ffyg', 'hygj*', 'H'],
      'ef*':      ['ff*', 'h*', 'H'],
      'ffe':      ['hej*', 'hello', 'hello2', 'H'],
      'f*':       ['h*', 'H'],
      'ff':       ['hj*', 'H'],
      '*':        ['q*', 'b', 'cc', 'eX*', 'dYY', 'eZZZ', 'f*', 'h*', 'H', 'Q'],
    },
  }, {
    title: 'pattern hierarchy',
    rules: [
      {pattern: 'a*',   scopes: ['A']},
      {pattern: 'aa*',  scopes: ['AA']},
      {pattern: 'aaa*', scopes: ['AAA']},
      {pattern: 'ab*',  scopes: ['AB']},
      {pattern: 'abc*', scopes: ['ABC']},
    ],
    hasIndirctResults: false,
    results: {
      'a':        ['A'],
      'aa':       ['A', 'AA'],
      'aaa':      ['A', 'AA', 'AAA'],
      'aaaa':     ['A', 'AA', 'AAA'],
      'aa*':      ['A', 'AA', 'AAA'],
      'ab':       ['A', 'AB'],
      'abc':      ['A', 'AB', 'ABC'],
      'abcd':     ['A', 'AB', 'ABC'],
      'ab*':      ['A', 'AB', 'ABC'],
      'a*':       ['A', 'AA', 'AAA', 'AB', 'ABC'],
    },
  },  {
    title: 'prefix-parameterized hierarchy',
    rules: [
      {pattern: 'a*',   scopes: ['A<..>']},
      {pattern: 'aa*',  scopes: ['AA<..>']},
      {pattern: 'aaa*', scopes: ['AAA<..>']},
      {pattern: 'ab*',  scopes: ['AB<..>']},
      {pattern: 'abc*', scopes: ['ABC<..>']},
    ],
    hasIndirctResults: false,
    results: {
      'a':        ['A'],
      'aa':       ['Aa', 'AA'],
      'aaa':      ['Aaa', 'AAa', 'AAA'],
      'aaaa':     ['Aaaa', 'AAaa', 'AAAa'],
      'aa*':      ['Aa*', 'AA*'],
      'ab':       ['Ab', 'AB'],
      'abc':      ['Abc', 'ABc', 'ABC'],
      'abcd':     ['Abcd', 'ABcd', 'ABCd'],
      'ab*':      ['Ab*', 'AB*'],
      'a*':       ['A*'],
    },
  }, {
    title: 'parameterized hierarchy',
    rules: [
      {pattern: 'a*',   scopes: ['A<..>X']},
      {pattern: 'aa*',  scopes: ['AA<..>X']},
      {pattern: 'aaa*', scopes: ['AAA<..>X']},
      {pattern: 'ab*',  scopes: ['AB<..>X']},
      {pattern: 'abc*', scopes: ['ABC<..>X']},
    ],
    hasIndirctResults: false,
    results: {
      'a':        ['AX'],
      'aa':       ['AaX', 'AAX'],
      'aaa':      ['AaaX', 'AAaX', 'AAAX'],
      'aaaa':     ['AaaaX', 'AAaaX', 'AAAaX'],
      'aa*':      ['Aa*', 'AA*'],
      'ab':       ['AbX', 'ABX'],
      'abc':      ['AbcX', 'ABcX', 'ABCX'],
      'abcd':     ['AbcdX', 'ABcdX', 'ABCdX'],
      'ab*':      ['Ab*', 'AB*'],
      'a*':       ['A*'],
    },
  }, {
    title: 'parameterized kleene hierarchy',
    rules: [
      {pattern: 'a*',   scopes: ['A<..>*']},
      {pattern: 'aa*',  scopes: ['AA<..>*']},
      {pattern: 'aaa*', scopes: ['AAA<..>*']},
      {pattern: 'ab*',  scopes: ['AB<..>*']},
      {pattern: 'abc*', scopes: ['ABC<..>*']},
    ],
    hasIndirctResults: false,
    results: {
      'a':        ['A*'],
      'aa':       ['Aa*', 'AA*'],
      'aaa':      ['Aaa*', 'AAa*', 'AAA*'],
      'aaaa':     ['Aaaa*', 'AAaa*', 'AAAa*'],
      'aa*':      ['Aa*', 'AA*'],
      'ab':       ['Ab*', 'AB*'],
      'abc':      ['Abc*', 'ABc*', 'ABC*'],
      'abcd':     ['Abcd*', 'ABcd*', 'ABCd*'],
      'ab*':      ['Ab*', 'AB*'],
      'a*':       ['A*'],
    },
  }, {
    title: 'parameterized suffixed kleene hierarchy',
    rules: [
      {pattern: 'a*',   scopes: ['A<..>X*']},
      {pattern: 'aa*',  scopes: ['AA<..>X*']},
      {pattern: 'aaa*', scopes: ['AAA<..>X*']},
      {pattern: 'ab*',  scopes: ['AB<..>X*']},
      {pattern: 'abc*', scopes: ['ABC<..>X*']},
    ],
    hasIndirctResults: false,
    results: {
      'a':        ['AX*'],
      'aa':       ['AaX*', 'AAX*'],
      'aaa':      ['AaaX*', 'AAaX*', 'AAAX*'],
      'aaaa':     ['AaaaX*', 'AAaaX*', 'AAAaX*'],
      'aa*':      ['Aa*', 'AA*'],
      'ab':       ['AbX*', 'ABX*'],
      'abc':      ['AbcX*', 'ABcX*', 'ABCX*'],
      'abcd':     ['AbcdX*', 'ABcdX*', 'ABCdX*'],
      'ab*':      ['Ab*', 'AB*'],
      'a*':       ['A*'],
    },
  }, {
    title: 'acylic parameterized rules',
    rules: [
      {pattern: 'a',          scopes: ['START']},
      {pattern: 'aaa*',       scopes: ['bb<..>BB']},
      {pattern: 'b*',         scopes: ['ccc<..>*']},
      {pattern: 'cc*',        scopes: ['dd<..>C']},
      {pattern: 'ddcbXBB',    scopes: ['C']},
      {pattern: 'dd*',        scopes: ['eee<..>D*']},
      {pattern: 'ddXC',       scopes: ['hello-world', 'you-made-it']},
    ],
    results: {
      'a':        ['START'],
      'aaaX':     ['bbXBB', 'cccbXBB*', 'ddcbXBB*', 'C', 'eeecbXBB*'],
      'ccX':      ['ddXC', 'eeeXCD*', 'hello-world', 'you-made-it'],
      'ddd':      ['eeedD*'],
    },
  }, {
    title: 'acylic parameterized matching pattern',
    rules: [
      {pattern: 'a*',         scopes: ['bb<..>BB']},
      {pattern: 'b*',         scopes: ['cc<..>*']},
      {pattern: 'c*',         scopes: ['dd<..>C']},
      {pattern: 'ddcbXBB',    scopes: ['C']},
    ],
    results: {
      'aX':     ['bbXBB', 'ccbXBB*', 'ddcbXBB*', 'C'],
    },
  }, {
    title: 'no rules',
    rules: [],
    hasIndirctResults: false,
    results: {
      '':       [],
      'a':      [],
      '*':      [],
      'abc*':   [],
    },
  }, {
    title: 'simple rules',
    rules: [
      {pattern: 'a',          scopes: ['A1', 'A2']},
      {pattern: 'b',          scopes: ['B1', 'B2']},
    ],
    results: {
      '':       [],
      '*':      ['A1', 'A2', 'B1', 'B2'],
      'a':      ['A1', 'A2'],
      'a*':     ['A1', 'A2'],
      'b':      ['B1', 'B2'],
      'b*':     ['B1', 'B2'],
      'ab':     [],
    },
  }, {
    title: 'simple rules in a DAG',
    rules: [
      {pattern: 'a',          scopes: ['c']},
      {pattern: 'b',          scopes: ['c']},
      {pattern: 'c',          scopes: ['D']},
    ],
    results: {
      '':       [],
      'c':      ['D'],
      'a':      ['c', 'D'],
      'b':      ['c', 'D'],
      '*':      ['c', 'D'],
      'a*':     ['c', 'D'],
      'b*':     ['c', 'D'],
    },
  }, {
    title: 'prefix matching rules in a DAG',
    rules: [
      {pattern: 'a*',         scopes: ['c']},
      {pattern: 'b*',         scopes: ['c']},
      {pattern: 'c*',         scopes: ['D']},
    ],
    results: {
      '':       [],
      'c':      ['D'],
      'a':      ['c', 'D'],
      'b':      ['c', 'D'],
      '*':      ['c', 'D'],
      'a*':     ['c', 'D'],
      'b*':     ['c', 'D'],
    },
  }, {
    title: 'parameterized rule variations',
    rules: [
      {pattern: 'A*',         scopes: ['b', 'c*', 'd<..>', 'e<..>*', 'f<..>g', 'h<..>i*']},
      {pattern: 'BC*',        scopes: ['b', 'c*', 'd<..>', 'e<..>*', 'f<..>g', 'h<..>i*']},
      {pattern: 'B*C*',       scopes: ['b', 'c*', 'd<..>', 'e<..>*', 'f<..>g', 'h<..>i*']},
    ],
    results: {
      '':         [],
      'A':        ['b', 'c*', 'd', 'e*', 'fg', 'hi*'],
      'AX':       ['b', 'c*', 'dX', 'eX*', 'fXg', 'hXi*'],
      'AXyX':     ['b', 'c*', 'dXyX', 'eXyX*', 'fXyXg', 'hXyXi*'],
      'AX*X':     ['b', 'c*', 'dX*X', 'eX*X*', 'fX*Xg', 'hX*Xi*'],
      'AZZ*':     ['b', 'c*', 'dZZ*', 'eZZ*', 'fZZ*', 'hZZ*'],
      'AZZ***':   ['b', 'c*', 'dZZ***', 'eZZ***', 'fZZ***', 'hZZ***'],
      'A*':       ['b', 'c*', 'd*', 'e*', 'f*', 'h*'],
      'A*X':      ['b', 'c*', 'd*X', 'e*X*', 'f*Xg', 'h*Xi*'],
      'BC':       ['b', 'c*', 'd', 'e*', 'fg', 'hi*'],
      'BCX':      ['b', 'c*', 'dX', 'eX*', 'fXg', 'hXi*'],
      'BCXyX':    ['b', 'c*', 'dXyX', 'eXyX*', 'fXyXg', 'hXyXi*'],
      'BCX*X':    ['b', 'c*', 'dX*X', 'eX*X*', 'fX*Xg', 'hX*Xi*'],
      'BCZZ*':    ['b', 'c*', 'dZZ*', 'eZZ*', 'fZZ*', 'hZZ*'],
      'BCZZ***':  ['b', 'c*', 'dZZ***', 'eZZ***', 'fZZ***', 'hZZ***'],
      'BC*':      ['b', 'c*', 'd*', 'e*', 'f*', 'h*'],
      'BC*X':     ['b', 'c*', 'd*X', 'e*X*', 'f*Xg', 'h*Xi*'],
      'B*C':      ['b', 'c*', 'd', 'e*', 'fg', 'hi*'],
      'B*CX':     ['b', 'c*', 'dX', 'eX*', 'fXg', 'hXi*'],
      'B*CXyX':   ['b', 'c*', 'dXyX', 'eXyX*', 'fXyXg', 'hXyXi*'],
      'B*CX*X':   ['b', 'c*', 'dX*X', 'eX*X*', 'fX*Xg', 'hX*Xi*'],
      'B*CZZ*':   ['b', 'c*', 'dZZ*', 'eZZ*', 'fZZ*', 'hZZ*'],
      'B*CZZ**':  ['b', 'c*', 'dZZ**', 'eZZ**', 'fZZ**', 'hZZ**'],
      'B*C*':     ['b', 'c*', 'd*', 'e*', 'f*', 'h*'],
      'B*C*X':    ['b', 'c*', 'd*X', 'e*X*', 'f*Xg', 'h*Xi*'],
    },
  }, {
    title: 'parameterized role DAG',
    rules: `
      a*    ->    c<..>A
      b*    ->    c<..>B*
      c*    ->    e<..>
    `,
    results: `
      a     =>    cA eA
      abc   =>    cbcA ebcA
      bXYX  =>    cXYXB* eXYXB*
    `,
  }, {
    title: 'chain of rules',
    rules: `
      a     ->    b
      b     ->    c
      c     ->    d
      d     ->    e
      e     ->    f
      f     ->    g
      g     ->    abc
      abc   ->    1
      1     ->    12
      12    ->    123
      123   ->    1234
      1234  ->    12345
      12345 ->    GOAL
      num   ->    1*
    `,
    results: `
      a     =>    b c d e f g abc 1 12 123 1234 12345 GOAL
      d     =>    e f g abc 1 12 123 1234 12345 GOAL
      abc   =>    1 12 123 1234 12345 GOAL
      1     =>    12 123 1234 12345 GOAL
      num   =>    1* GOAL
      num*  =>    1* GOAL
      n*    =>    1* GOAL
      ???   =>
    `,
  }, {
    title: 'hierarchy of chained rules',
    rules: `
      a     ->    A
      aa    ->    AA
      aaa   ->    AAA
      a*    ->    A_
      aa*   ->    AA_
      aaa*  ->    AAA_
    `,
    results: `
      a     =>    A A_
      aaaa  =>    AAA_ AA_ A_
      aaa   =>    A_ AA_ AAA_ AAA
    `,
  }, {
    title: 'chain of star-rules',
    rules: `
      a     ->    b
      b     ->    c*
      c     ->    d--
      d*    ->    e*YY
      e**   ->    f
      f     ->    g
      g     ->    abc
      abc   ->    1
      1     ->    12
      12    ->    123*
      123   ->    1234
      1234  ->    12345
      12345 ->    GOAL
      num   ->    1*
    `,
    results: `
      a     =>    b c* d-- e*YY f g abc 1 12 123* GOAL
      d     =>    e*YY f g abc 1 12 123* GOAL
      abc   =>    1 12 123* GOAL
      1     =>    12 123* GOAL
      num   =>    1* GOAL
      num*  =>    1* GOAL
      n*    =>    1* GOAL
      ???   =>    // nothing
    `,
  }, {
    title: 'chain of parameterized rules',
    rules: `
      aa*   ->    b<..>C
      bb    ->    cYY
      c*    ->    d**/<..>/
    `,
    results: `
      a     =>    // nothing
      ???   =>    // nothing
      aa    =>    bC
      aab   =>    bbC
      aab*  =>    bb* cYY d**/YY/
      a*    =>    b* cYY d**/YY/
      aa*   =>    b* cYY d**/YY/
      *     =>    b* cYY d**/*
    `,
  }, {
    title: 'parameterized rules matches simple rule',
    rules: `
      aa*   ->    b<..>C
      bb    ->    cYY
    `,
    results: `
      a     =>    // nothing
      ???   =>    // nothing
      aa    =>    bC
      aab   =>    bbC
      aab*  =>    bb* cYY
      a*    =>    b* cYY
      aa*   =>    b* cYY
      *     =>    b* cYY
    `,
  }, {
    title: 'kleene in parameterization',
    rules: `
      a*    ->    A<..>B*
    `,
    results: `
      a     =>    AB*
      a*    =>    A*
      *     =>    A*
    `,
  }, {
    title: 'example of namespacing with roles',
    rules: `
      ns:*        -> index:user.<..>.* notify:irc:<..>
    `,
    results: `
      ns:jonasfj  => index:user.jonasfj.* notify:irc:jonasfj
      ns:*        => index:user.* notify:irc:*
      ns:evil*    => index:user.evil* notify:irc:evil*
    `,
  }, {
    title: 'match exact though parameterized role',
    rules: `
      a*        ->    A<..>B*
      param:*   ->    A<..>B
      A-123-B   ->    GOAL
      ATB       ->    TARGET
      ATB*      ->    TARGET++
      AT*       ->    prefix
    `,
    results: `
      a         =>    AB*
      a-123     =>    A-123B*
      a-123-    =>    A-123-B* GOAL
      a*        =>    A* GOAL prefix TARGET TARGET++
      *         =>    A* GOAL prefix TARGET TARGET++
      param:T   =>    ATB prefix TARGET TARGET++
    `,
  },
].map(({title, rules, hasIndirctResults, results}) => {
  const parse = (input, op) => input
    .split('\n')                    // split on new lines
    .map(l => l.split('//')[0])     // remove anything following '//' for comments
    .map(l => l.trim())             // trim whitespace from lines
    .filter(l => l !== '')          // filter empty lines
    .map(l => {                     // for each line split on operator
      assume(l).includes(op, `expected an operator in: '${title}'`);
      const [A, B] = l.split(op);
      return [A.trim(), B.split(' ').map(s => s.trim()).filter(s => !!s)];
    });
  if (typeof rules === 'string') {
    rules = parse(rules, '->').map(([pattern, scopes]) => ({pattern, scopes}));
  }
  if (typeof results === 'string') {
    results = Object.assign({}, ...parse(results, '=>').map(([input, result]) => ({[input]: result})));
  }
  if (hasIndirctResults === undefined) {
    // if not given we assume true, unless there is only 1 rules
    hasIndirctResults = rules.length > 1;
  }
  return {title, rules, hasIndirctResults, results};
});
/* eslint-enable quote-props */

// Export testcases
module.exports = testcases;
