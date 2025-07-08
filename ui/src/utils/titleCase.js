import { titleCase } from 'title-case';
import { map, split, join, pipe } from 'ramda';
import { KNOWN_ACRONYMS } from './constants';

const upperAcronym = word =>
  KNOWN_ACRONYMS.some(acronym => acronym.toLowerCase() === word.toLowerCase())
    ? word.toUpperCase()
    : word;

export default pipe(titleCase, split(' '), map(upperAcronym), join(' '));
