let debug = require('debug')('taskcluster-lib-validate');
let Promise = require('promise');
let fs = require('fs');
let path = require('path');

function s3(s3, bucket, prefix, name, content) {
  return new Promise((accept, reject) => {
    debug('Publishing schema %s', name);
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

/**
 * Write the schema to a local file.  This is useful for debugging purposes
 * mainly.
 */
function writeFile(name, content) {
  let toPrint;
  // We want something that's pretty-printable, so let's parse and reserialise
  // the JSON in a nice way.  If this fails, let's just write out whatever was
  // there.
  try {
    toPrint = JSON.stringify(JSON.parse(content), null, 2);
  } catch (err) {
    toPrint = content;
  }
  return new Promise((resolve, reject) => {
    fs.writeFile(path.join('rendered_schemas', name), toPrint, (err) => {
      if (err) {
        reject(err);
      }
      console.log('Wrote ' + name);
      resolve();
    });
  });
}

/**
 * Write the generated schema to the console as pretty-json output.  This is
 * useful for debugging purposes
 */
function preview(name, content) {
  let toPrint;
  // We want something that's pretty-printable, so let's parse and reserialise
  // the JSON in a nice way.  If this fails, let's just write out whatever was
  // there.
  try {
    toPrint = JSON.stringify(JSON.parse(content), null, 2);
  } catch (err) {
    toPrint = content;
  }
  console.log('=======');
  console.log('JSON SCHEMA PREVIEW BEGIN: ' + name);
  console.log('=======');
  console.log(toPrint);
  console.log('=======');
  console.log('JSON SCHEMA PREVIEW END: ' + name);
  return Promise.resolve();
}

module.exports = {
  s3: s3,
  writeFile: writeFile,
  preview: preview,
};
