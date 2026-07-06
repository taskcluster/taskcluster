/**
 * Case-insensitive literal-substring filter over an array of objects, matching on a single named field.
 * This replaces the previous sift-based filtering for the UI's search boxes:
 * the UI only ever sent a single escaped substring per
 * field, so there is no need for a general query interpreter.
 * The search term is matched literally — it is never compiled or interpreted as a regex or expression.
 * @param {string} searchTerm
 * @param {string} field
 * @param {Array<{[key: string]: unknown}>} array
 */
export default (searchTerm, field, array) => {
  if (!array) {
    return [];
  }

  if (!searchTerm) {
    return array;
  }

  const needle = String(searchTerm).toLowerCase();

  return array.filter(item =>
    String(item?.[field] ?? '')
      .toLowerCase()
      .includes(needle)
  );
};
