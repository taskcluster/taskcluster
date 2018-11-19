const libUrls = require('taskcluster-lib-urls');
const regexEscape = require('regex-escape');

/**
 * Make a "serializable" data structure from the given references
 */
const makeSerializable = ({references}) => {
  const urls = libUrls.withRootUrl(references.rootUrl || '');
  const referenceFilename = content => {
    const serviceName = content.serviceName;
    const apiVersion = content.apiVersion || 'v1';
    const kind = references.getSchema(content.$schema).metadata.name;
    return `references/${serviceName}/${apiVersion || 'v1'}/${kind}.json`;
  };

  const namedReferences = references.references.map(({filename, content}) => ({
    content,
    filename: referenceFilename(content),
  }));

  let urlPattern;
  if (references.rootUrl === 'https://taskcluster.net') {
    urlPattern = /^https:\/\/schemas\.taskcluster\.net\/(.*)#/;
  } else if (references.rootUrl) {
    urlPattern = new RegExp(`^${regexEscape(references.rootUrl)}/schemas\/(.*)#`);
  } else {
    urlPattern = /^\/schemas\/(.*)#/;
  }
  const schemaFilename = content => content.$id.replace(urlPattern, 'schemas/$1');

  const namedSchemas = references.schemas.map(({filename, content}) => ({
    content,
    filename: schemaFilename(content),
  }));

  const manifest = {
    $schema: urls.schema('common', 'manifest-v3.json#'),
    references: namedReferences.map(({filename}) => {
      if (references.rootUrl === 'https://taskcluster.net') {
        return filename.replace(/^references/, 'https://references.taskcluster.net');
      } else if (references.rootUrl) {
        return `${references.rootUrl}/${filename}`;
      } else {
        return `/${filename}`;
      }
    }).sort(),
  };

  return [{
    filename: 'references/manifest.json',
    content: manifest,
  }].concat(namedSchemas).concat(namedReferences);
};

const fromSerializable = ({serializable}) => {
  const references = [];
  const schemas = [];

  serializable.forEach(({filename, content}) => {
    if (filename.startsWith('schemas/')) {
      schemas.push({filename, content});
    } else if (filename === 'references/manifest.json') {
      // ignore an existing manifest
    } else if (filename.startsWith('references/')) {
      references.push({filename, content});
    } else {
      throw new Error(`unexpected file: ${filename}`);
    }
  });

  return {references, schemas};
};

exports.makeSerializable = makeSerializable;
exports.fromSerializable = fromSerializable;
