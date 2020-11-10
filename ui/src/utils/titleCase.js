import { lowerCase } from 'lower-case';
import { titleCase } from 'title-case';
import { upperCase } from 'upper-case';
import { map, split, join, pipe } from 'ramda';
import { KNOWN_ACRONYMS } from './constants';

const upperAcronym = word =>
  KNOWN_ACRONYMS.some(acronym => lowerCase(acronym) === lowerCase(word))
    ? upperCase(word)
    : word;

export default pipe(
  titleCase,
  split(' '),
  map(upperAcronym),
  join(' ')
);
