import { omit } from 'ramda';
import cloneDeep from 'lodash.clonedeep';
import removeKeys from './removeKeys';
import { TASK_ADDED_FIELDS } from './constants';

/**
 * Given a task in the format embedded in graphql queries, convert it
 * into a "normal" task payload.
 */
// eslint-disable-next-line import/prefer-default-export
export function gqlTaskToApi(task) {
  let cloned = cloneDeep(task);

  // remove the apollo-graphql __typename annotation
  cloned = removeKeys(cloned, ['__typename']);
  // omit the fields present in graphql but not in the API payload
  cloned = omit(TASK_ADDED_FIELDS, cloned);
  // convert graphql-style constants to the underlying API constants
  cloned.priority = cloned.priority.toLowerCase();
  cloned.requires = cloned.requires.toLowerCase().replace(/_/g, '-');

  return cloned;
}
