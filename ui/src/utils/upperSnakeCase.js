import { pipe } from 'ramda';
import { snakeCase } from 'snake-case';

// Example: all-completed becomes ALL_COMPLETED
export default pipe(snakeCase, (str) => str.toUpperCase());
