import _ from 'lodash';

export const getEntries = ({ partitionKey, rowKey, condition }, entries) => {
  entries = [...entries.values()];
  entries = _.sortBy(entries, e => [e.partition_key_out, e.row_key_out]);

  if (!partitionKey && !rowKey && !condition) {
    return entries;
  }

  return entries.filter(entry => {
    let flag = false;

    if (entry.partition_key_out === partitionKey && entry.row_key_out === rowKey) {
      flag = true;
    }

    if (entry.partition_key_out === partitionKey && !rowKey) {
      flag = true;
    }

    if (entry.row_key_out === rowKey && !partitionKey) {
      flag = true;
    }

    if (!rowKey && !partitionKey) {
      flag = true;
    }

    if (condition) {
      const cond = condition.replace('value ->>', '').trim();
      const operator = cond.match(/(=|>|<|>=|<=|<>)/)[1];
      const date = condition.match(/(\d{4}-\d{2}-\d{2}T\d{2}\:\d{2}\:\d{2}\.\d{3}Z)/)[1];
      const property = condition.match(/'([a-zA-Z]+)'/)[1];

      if (operator === "=" && entry.value[property] !== date) {
        return false;
      } else if (operator === ">" && new Date(entry.value[property]) <= new Date(date)) {
        return false;
      } else if (operator === "<" && new Date(entry.value[property]) >= new Date(date)) {
        return false;
      } else if (operator === ">=" && new Date(entry.value[property]) < new Date(date)) {
        return false;
      } else if (operator === "<=" && new Date(entry.value[property]) > new Date(date)) {
        return false;
      } else if (operator === "<>" && new Date(entry.value[property]) === new Date(date)) {
        return false;
      }
    }

    return flag;
  });
};
