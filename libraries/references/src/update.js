const _ = require('lodash');
const url = require('url');
const SchemaSet = require('taskcluster-lib-validate');

/**
 * Update the given references and schemas (in-place):
 *
 *  * add common schemas from this repository's schemas/ directory
 *  * make schemas' $id's relative to rootUrl (and use $id rather than id)
 *  * set references' serviceName and version and remove deprecated fields
 */
exports.update = async ({references, schemas, rootUrl}) => {
  await addCommonSchemas(schemas);
  updateReferences(references);
  updateSchemas(schemas, rootUrl);
};

/**
 * Calculate the reference's serviceName and guess at version (v1), then remove
 * deprecated fields name and baseUrl.
 */
const updateReferences = (references) => {
  references.forEach(reference => {
    let serviceName = reference.serviceName;
    if (!serviceName) {
      if (reference.name) {
        serviceName = reference.name;
      } else if (reference.baseUrl) {
        serviceName = reference.baseUrl.split('//')[1].split('.')[0];
      } else if (reference.exchangePrefix) {
        serviceName = reference.exchangePrefix.split('/')[1].replace('taskcluster-', '');
      }
    }
    reference.serviceName = serviceName;

    if (!reference.version) {
      reference.version = 'v1';
    }

    delete reference.name;
    delete reference.baseUrl;
  });
};
exports.updateReferences = updateReferences;

/**
 * Load common schemas stored in this (taskcluster-references) repository.
 */
const addCommonSchemas = async (schemas) => {
  const schemaset = new SchemaSet({serviceName: 'common'});
  _.values(schemaset.abstractSchemas()).forEach(schema => {
    schemas.push(schema);
  });
};
exports.addCommonSchemas = addCommonSchemas;

/**
 * Update the $id property in all schemas
 */
const updateSchemas = (schemas, rootUrl) => {
  schemas.forEach(schema => {
    const $id = url.parse(schema.$id || schema.id);

    // compatibility with old, non-r13y schemas (this can be removed when none remain)
    if ($id.hostname === 'schemas.taskcluster.net') {
      schema.$id = url.resolve(rootUrl, '/schemas' + $id.pathname) + '#';
    } else {
      schema.$id = url.resolve(rootUrl, $id.pathname) + '#';
    }
    delete schema.id;
  });
};
exports.updateSchemas = updateSchemas;
