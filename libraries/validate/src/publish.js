let debug = require('debug')('taskcluster-lib-validate');
let Promise = require('promise');

function publish (s3, bucket, prefix, name, content) {
  return new Promise((accept, reject) => {
    debug('Publishing schema %s', name);
    content = JSON.stringify(content, undefined, 4);
    if (!content) {
      debug('Schema %s has invalid content!', name);
      return reject();
    }
    s3.putObject({
      Bucket: bucket,
      Key: prefix + name,
      Body: content,
      ContentType: 'application/json',
    }, (err, data) => {
      if (err) {
        debug('Publishing failed for schema %s', name);
        return reject(err);
      }
      debug('Publishing succeeded for schema %s', name);
      return accept(data);
    });
  });
}

module.exports = publish;
