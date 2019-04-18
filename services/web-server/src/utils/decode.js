// Decoding:
// 1. Replace ! with %
// 2. Decode with decodeUriComponent (which converts %21 to !)
module.exports = str => decodeURIComponent(str.replace(/!/g, '%'));
