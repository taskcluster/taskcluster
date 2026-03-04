import sift from 'sift';

// Utility function for guarding against undefined/null arrays when using sift
export default (filter, array) => {
  if (!array) {
    return [];
  }
  return filter ? array.filter(sift(filter)) : array;
};
