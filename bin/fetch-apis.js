const got = require('got');

const MANIFEST_URL = 'http://references.taskcluster.net/manifest.json';

module.exports = async () => {
  const { body } = await got(MANIFEST_URL, { json: true });
  const apis = {};

  await Promise.all(Object
    .keys(body)
    .map(name => got(body[name], { json: true })
      .then(response => apis[name] = {
        referenceUrl: body[name],
        reference: response.body
      })));

  return apis;
};

module.exports.MANIFEST_URL = MANIFEST_URL;
