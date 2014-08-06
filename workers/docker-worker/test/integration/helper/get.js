var request = require('superagent-promise');

module.exports = function* get(url) {
  return (yield request.get(url).end()).text;
}
