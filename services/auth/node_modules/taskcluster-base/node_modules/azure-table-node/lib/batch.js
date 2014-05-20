'use strict';

var url = require('url');
var uuid = require('node-uuid');
var async = require('async');

var BOUNDARY_REGEXP = /boundary=(.*)/;

// this is more or less only a function donor
var Batch = {
  _makeRequest: function _makeRequest(method, path, qs, body, filter, cb) {
    // first simulate most of the things normal makeRequest do
    if (cb == null) {
      cb = filter;
    }
    var options = {
      method: method,
      uri: url.parse(this._settings.accountUrl + path),
      qs: qs,
      headers: {
        accept: 'application/json;odata='+this._settings.metadata+'metadata'
      }
    };
    if (method !== 'GET' && method !== 'DELETE') {
      options.headers['content-type'] = 'application/json';
    }
    if (cb !== filter && filter != null) {
      options = filter.call(this, options);
    }

    // prepare batch element as string
    var content = 'Content-Type: application/http\r\nContent-Transfer-Encoding: binary\r\n\r\n';
    if (options.qs) {
      options.uri.query = qs;
    }
    content += method+' '+url.format(options.uri)+' HTTP/1.1\r\n';
    content += 'content-id: '+this._batchElements.length+'\r\n';
    Object.keys(options.headers).forEach(function (key) {
      content += key + ': ' + options.headers[key] + '\r\n';
    });
    if (body == null) {
      content += '';
    } else {
      content += '\r\n'+JSON.stringify(body);
    }

    this._batchElements.push({
      method: method,
      request: content,
      respCb: cb
    });
  },

  _commitCb: function _commitCb(cb, err, data) {
    // in case of global batch error, push the error immediately
    if (err) {
      return cb(err);
    }
    // it must be 202 to parse below properly
    if (data.statusCode !== 202) {
      return cb(data);
    }
    var body = data.body;

    // find changesetId to be able to split
    var batchId = data.headers['content-type'].match(BOUNDARY_REGEXP)[1];
    var temp = body.indexOf('--'+batchId) + batchId.length + 5;
    var changesetId = body.substr(temp, 100).match(BOUNDARY_REGEXP);
    if (changesetId) {
      changesetId = changesetId[1];
    }

    // split to responses removing first and last as they are not important
    // if changesetId is not known, use batchId (for queries)
    var rawResponses = body.split('--'+(changesetId || batchId));
    rawResponses.shift();
    rawResponses.pop();

    var responses = [], resp, i, j;
    for (i = 0; i < rawResponses.length; ++i) {
      // remove the beginning including HTTP/1.1
      temp = rawResponses[i].indexOf('HTTP/1.');
      if (temp === -1) {
        continue;
      }
      temp = rawResponses[i].substr(temp + 9);

      resp = {
        statusCode: parseInt(temp.substr(0, 3)),
        headers: {},
        body: null
      };

      temp = temp.split('\r\n');
      // skip the first line with HTTP
      var toBody = false;
      body = '';
      for (j = 1; j < temp.length; ++j) {
        if (toBody) {
          body += temp[j];
        } else if (temp[j] === '') { // first empty means end of headers
          toBody = true;
        } else {
          var headerColon = temp[j].indexOf(':');
          resp.headers[temp[j].substring(0, headerColon).toLowerCase()] = temp[j].substring(headerColon + 1).trim();
        }
      }
      if (body.length > 0) {
        resp.body = body;
      }

      responses.push(resp);
    }

    var self = this, parsedResponses = [];
    async.forEach(responses, function(r, cb) {
      var reqId = r.headers['content-id'];
      var id = reqId != null ? parseInt(reqId) : 0;
      var respCb = self._batchElements[id].respCb;
      self._normalizeCallback(function(err, data) {
        var resp = respCb(err, data);
        if (resp.err) {
          cb(resp.err);
        } else {
          parsedResponses[id] = resp.data;
          cb();
        }
      }, null, r, r.body);
    }, function(err) {
      if (err) {
        cb(err);
      } else {
        cb(null, parsedResponses);
      }
    });

  },
  commit: function commit(cb) {
    if (this._batchElements.length === 0) {
      throw 'There must be at least one operation added to commit a batch!';
    }

    var batchId = 'batch_'+uuid.v4();

    var options = this._getRequestSpecificOptions('POST', '$batch');
    options.headers['accept-charset'] = 'UTF-8';
    // we have DataServiceVersion already, so below shouldn't be required,
    // but JSON works only with MaxDataServiceVersion in $batch -- Azure bug?
    options.headers.MaxDataServiceVersion = '3.0;NetFx';
    options.headers['content-type'] = 'multipart/mixed; boundary='+batchId;
    if (this._azureKey) {
      options = this._addSharedKeyAuthHeader(options);
    } else {
      options = this._addSAS(options);
    }

    var body;
    if (this._batchElements.length > 1 || this._batchElements[0].method !== 'GET') {
      delete options.headers.accept;
      var changesetId = 'changeset_'+uuid.v4();
      body = '--'+batchId+'\r\nContent-Type: multipart/mixed; boundary='+changesetId+'\r\n';
      for (var i = 0; i < this._batchElements.length; ++i) {
        body += '\r\n--'+changesetId+'\r\n'+this._batchElements[i].request;
      }
      body += '\r\n--'+changesetId+'--\r\n--'+batchId+'--';
    } else {
      body = '--'+batchId+'\r\n';
      body += this._batchElements[0].request;
      body += '\r\n--'+batchId+'--';
    }

    options.body = body;
    this._sendRequestWithRetry(options, this._commitCb.bind(this, cb));
  },

  create: function create(client) {
    var batchedClient = Object.create(client, {
      _batchElements: {value: []},
      _makeRequest: {value: Batch._makeRequest},
      _commitCb: {value: Batch._commitCb},
      commit: {value: Batch.commit}
    });

    return batchedClient;
  }

};

exports.Batch = Batch;