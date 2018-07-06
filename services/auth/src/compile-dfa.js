// NOT CURRENTLY IN USE
// retained for illustrative purposes.

/**
 * Compile DFA to a function equivalent to `executeDFA.bind(null, dfa)`.
 */
const compileDFA = (dfa) => {
  // Render a DFA state to code
  let renderDFA = (state, depth) => {
    let d = '';
    while (d.length < depth * 4) {d += '    ';}
    let c = '';
    if (typeof state.end === 'number') {
      c += d + 'if (n === ' + depth + ') {\n';
      c += d + '  return ' + state.end;
      c += d + '}\n';
    }
    // In each state we switch on the `scope` variable at the given depth.
    c += d + 'switch(scope[' + depth + ']) {\n';
    _.forEach(state, (s, character) => {
      if (character === 'default' || character === 'end') {
        return;
      }
      // For each key of the state object that isn't 'prefix' or 'end' we have
      // a transition to another state. So we render the switch for that DFA.
      c += d + '  case ' + JSON.stringify(character) + ':\n';
      c += renderDFA(s, depth + 1);
      c += d + '    break;\n';
    });
    c += d + '  default:\n';
    c += d + '    return ' + (state.default || 0) + ';\n';
    c += d + '}\n';
    return c;
  };
  // Initially the implied roles is the empty set [] == sets[0], which is why
  // we call with sets = [[]] and i = 0. Obviously, we start at character offset
  // zero, hence, depth = 0.
  let body = 'var n = scope.length;\n' + renderDFA(dfa, 0);

  // Create resolver function and give it scopes as parameter.
  return new Function('scope', body);
};
