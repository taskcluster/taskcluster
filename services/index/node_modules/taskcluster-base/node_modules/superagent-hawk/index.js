var hawk = require('hawk');
var extend = require('./lib/extend');

exports =
module.exports = function addHawk (superagent) {
  var RequestProto = superagent.Test
                      ? superagent.Test.prototype
                      : superagent.Request.prototype;

  RequestProto.hawk = function(credential, moreOptions) {
    var url = this.url;
    var method = this.method;

    var contentType;
    if (this.getHeader && this.getHeader instanceof Function)
      contentType = this.getHeader('content-type');
    else if (this.get && this.get instanceof Function)
      contentType = this.get('content-type');

    var isJSON = this._data &&
                 this._data instanceof Object &&
                 contentType === 'application/json';

    var data = (isJSON) ? JSON.stringify(this._data) : this._data;

    var options = {
      credentials: credential,
      contentType: contentType,
      payload: data
    };

    if (options && typeof options == 'object')
      options = extend(options, moreOptions);

    this.set('Authorization',
      hawk.client.header(url, method, options).field);

    return this;
  };

  RequestProto.bewit = function(bewit) {
    this.query({ bewit: bewit });
    return this;
  };

  return superagent;
};
