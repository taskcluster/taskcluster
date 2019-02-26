import { upperCase, snakeCase } from 'change-case';
import { pipe } from 'ramda';

// Example: all-completed becomes ALL_COMPLETED
export default pipe(
  snakeCase,
  upperCase
);
