const got = require('got');

const MANIFEST_URL = 'http://references.taskcluster.net/manifest.json';

module.exports = () => {
  const apis = {};

  return got(MANIFEST_URL, { json: true })
    .then(({ body }) => Promise.all(Object
      .keys(body)
      .map(name => got(body[name], { json: true })
        .then(response => apis[name] = {
          referenceUrl: body[name],
          reference: response.body
        }))))
    .then(() => apis);
};

module.exports.MANIFEST_URL = MANIFEST_URL;
