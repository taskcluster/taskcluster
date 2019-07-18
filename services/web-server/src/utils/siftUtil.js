const sift = require('sift').default;

// Utility function for guarding against undefined/null arrays when using sift
module.exports = (filter, array) => {
    if (!array) {
        return [];
    }
    return filter ? array.filter(sift(filter)) : array;
};
  