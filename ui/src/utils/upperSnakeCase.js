import { upperCase } from 'upper-case';
import { snakeCase } from 'snake-case';
import { pipe } from 'ramda';

// Example: all-completed becomes ALL_COMPLETED
export default pipe(snakeCase, upperCase);
