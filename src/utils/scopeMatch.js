import {
  T,
  F,
  equals,
  cond,
  dropLast,
  pipe,
  identity,
  test,
  not,
  compose,
} from 'ramda';
import { SCOPES_SEARCH_MODE } from './constants';

/**
 * A match function targeted on scopes.
 *
 * scopeMatch :: String mode -> String selectedScope ->
 *  (String scope -> Boolean isMatch)
 * */
export default (mode, selectedScope) => {
  const exact = equals(selectedScope);
  const hasScope = cond([
    [exact, T],
    [
      test(/\\*$/),
      pipe(dropLast(1), scope => selectedScope.indexOf(scope), equals(0)),
    ],
    [T, F],
  ]);
  const hasSubScopePattern = cond([
    [compose(not, test(/\\*$/)), pattern => `${pattern}*`],
    [T, identity],
  ])(selectedScope);

  switch (mode) {
    case SCOPES_SEARCH_MODE.EXACT:
      return exact;
    case SCOPES_SEARCH_MODE.HAS_SCOPE:
      return hasScope;
    case SCOPES_SEARCH_MODE.HAS_SUB_SCOPE:
      return cond([
        [equals(hasSubScopePattern), T],
        [T, scope => scope.indexOf(dropLast(1, hasSubScopePattern)), equals(0)],
      ]);
    default:
      return T;
  }
};
