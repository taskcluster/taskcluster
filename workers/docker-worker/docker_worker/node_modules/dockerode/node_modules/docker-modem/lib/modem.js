var querystring = require('querystring'),
    http = require('follow-redirects').http,
    fs = require('fs'),
    p = require('path'),
    url = require('url');
    stream = require('stream');


var Modem = function(opts) {
  this.socketPath = opts.socketPath;
  this.host = opts.host;
  this.port = opts.port;
  this.version = opts.version;
};


Modem.prototype.dial = function(options, callback) {
  var opts, address, data, datastream;
  var self = this;

  if (options.options) {
    opts = options.options;
  }

  if(this.version) {
    options.path = '/' + this.version + options.path;
  }

  if(this.host) {
    address = url.resolve(this.host + ':' + this.port, options.path);
  } else {
    address = options.path;
  }


  if(options.path.indexOf('?') !== -1) {
    if (opts && Object.keys(opts).length > 0) {
      address += querystring.stringify(opts);
    } else {
      address = address.substring(0, address.length - 1);
    }
  }

  var optionsf = {
    path: address,
    method: options.method
  };

  optionsf.headers = {};

  if(options.authconfig) {
    optionsf.headers['X-Registry-Auth'] = authconfig;
  }

  if(options.file) {
    if (stream.Readable ? options.file instanceof stream.Readable : options.file instanceof stream && options.file.readable) {
      datastream = options.file
    } else {
      data = fs.readFileSync(p.resolve(options.file));
    }
    optionsf.headers['Content-Type'] = 'application/tar';
  } else if(opts && options.method === 'POST') {
    data = JSON.stringify(opts);
    optionsf.headers['Content-Type'] = 'application/json';
  }

  if(data) {
    optionsf.headers['Content-Length'] = data.length;
  }

  if(this.socketPath) {
    optionsf.socketPath = this.socketPath;
  } else {
    optionsf.hostname = url.parse(address).hostname;
    optionsf.port = url.parse(address).port;
  }

  var req = http.request(optionsf, function() {});

  req.on('response', function(res) {
    if (options.isStream) {
      self.buildPayload(null, options.isStream, options.statusCodes, res, null, callback);
    } else {
      var chunks = '';
      res.on('data', function(chunk) {
        chunks += chunk;
      });

      res.on('end', function() {
        var json;
        try {
          json = JSON.parse(chunks);
        } catch(e) {
          json = chunks;
        }
        self.buildPayload(null, options.isStream, options.statusCodes, res, json, callback);
      });
    }
  });

  req.on('error', function(error) {
    self.buildPayload(error, options.isStream, options.statusCodes, {}, null, callback);
  });

  if(data) {
    req.write(data);
  }
  if (datastream) {
    datastream.pipe(req);
  } else {
    req.end();
  }
};


Modem.prototype.buildPayload = function(err, isStream, statusCodes, res, json, cb) {
  if (err) return cb(err, null);

  if (statusCodes[res.statusCode] !== true) {
    var msg = new Error(
      'HTTP code is ' + res.statusCode + ' which indicates error: ' + statusCodes[res.statusCode] + ' - ' + json
    );
    cb(msg, null);
  } else {
    if (isStream) {
      cb(null, res);
    } else {
      cb(null, json);
    }
  }
};

Modem.prototype.demuxStream = function(stream, stdout, stderr) {
  var header = null;

  stream.on('readable', function() {
    header = header || stream.read(8);
    while(header !== null) {
      var type = header.readUInt8(0);
      var payload = stream.read(header.readUInt32BE(4));
      if (payload === null) break;
      if(type == 2) {
        stderr.write(payload);
      } else {
        stdout.write(payload);
      }
      header = stream.read(8);
    }
  });
};

module.exports = Modem;
