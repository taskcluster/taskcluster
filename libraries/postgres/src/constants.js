export const READ = 'read';
export const WRITE = 'write';

// = see https://www.postgresql.org/docs/15/errcodes-appendix.htm;
export const DUPLICATE_OBJECT = '42710';
export const DUPLICATE_TABLE = '42P07';
export const INVALID_PARAMETER_VALUE = '22023';
export const NUMERIC_VALUE_OUT_OF_RANGE = '22003';
export const QUERY_CANCELED = '57014';
export const READ_ONLY_SQL_TRANSACTION = '25006';
export const UNDEFINED_COLUMN = '42703';
export const UNDEFINED_OBJECT = '42704';
export const UNDEFINED_TABLE = '42P01';
export const UNDEFINED_FUNCTION = '42883';
export const UNIQUE_VIOLATION = '23505';
export const CHECK_VIOLATION = '23514';
export const SYNTAX_ERROR = '42601';
export const FOREIGN_KEY_VIOLATION = '23503';
