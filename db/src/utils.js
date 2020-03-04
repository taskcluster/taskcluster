exports.getEntries = ({ partitionKey, rowKey, condition }, entries) => {
  if (!partitionKey && !rowKey && !condition) {
    return [...entries];
  }

  return [...entries].filter(entry => {
    if (entry.partition_key_out === partitionKey && entry.row_key_out === rowKey) {
      return true;
    }

    if (condition) {
      const cond = condition.replace('value ->>', '').trim();
      const operator = cond.match(/(=|>|<|>=|<=|<>)/)[1];
      const date = condition.match(/(\d{4}-\d{2}-\d{2}T\d{2}\:\d{2}\:\d{2}\.\d{3}Z)/)[1];

      if (operator === "=" && entry.value.expires !== date) {
        return false;
      } else if (operator === ">") {
        return false;
      } else if (operator === "<") {
        return false;
      } else if (operator === ">=") {
        return false;
      } else if (operator === "<=") {
        return false;
      } else if (operator === "<>") {
        return false;
      }
    }

    return true;
  });
};
