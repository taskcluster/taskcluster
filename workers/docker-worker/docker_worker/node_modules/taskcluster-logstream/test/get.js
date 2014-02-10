var http = require('http'),
    Promise = require('promise');

/**
Minimal wrapper around node's http.get function (using promises)
*/
function get(url) {
  return new Promise(function(accept, reject) {

    // handle success
    var req = http.get(url, function(res) {
      var buffer = new Buffer(0);
      res.on('data', function(content) {
        buffer = Buffer.concat([buffer, content]);
      });

      res.on('end', function() {
        res.content = buffer;
        res.text = buffer.toString();
        accept(res);
      });
    });

    // handle errors
    req.once('error', reject);
  });
}

module.exports = get;
