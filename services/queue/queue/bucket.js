var Promise = require('promise');
var urlJoin = require('url-join');
var debug = require('debug')('queue:taskBucket');

function bucketConfig(tasks, input) {
  var config = {};
  for (var key in input) config[key] = input[key];
  config.Bucket = tasks.bucket;
  return config;
}

/**
Small abstraction on top of common task s3 related operations.

@param {AWS.S3} s3 object.
@param {String} bucket name.
@param {String} [publicHref] public prefix for urls.
*/
function Tasks(s3, bucket, publicHref) {
  this.bucket = bucket;
  this.s3 = s3;
  this.publicHref = publicHref ? publicHref : s3.endpoint.href;
}

Tasks.prototype = {

  get: function(path) {
    debug('get item from bucket', path);
    var config = bucketConfig(this, { Key: path });
    return this.s3.getObject(config).
      promise().
      then(function(response) {
        var data = response.data.Body.toString('utf8');
        return JSON.parse(data);
      }).
      catch(function(err) {
        if (err.code === 'NoSuchKey') return null;
        throw err;
      });
  },

  put: function(path, object) {
    debug('put item in bucket', path);
    return this.s3.putObject(bucketConfig(
      this,
      {
        Key: path,
        Body: JSON.stringify(object),
        ContentType: 'application/json'
      }
    )).promise();
  },

  signedPutUrl: function(path, timeout, contentType) {
    var signedUrl = Promise.denodeify(this.s3.getSignedUrl.bind(this.s3));
    var config = bucketConfig(this, {
      Key: path,
      ContentType: contentType || 'application/json',
      Expires: timeout
    });
    debug('sign url', path, config);
    return signedUrl('putObject', config);
  },

  publicUrl: function(path) {
    return urlJoin(this.publicHref, path);
  }

};

module.exports = Tasks;
