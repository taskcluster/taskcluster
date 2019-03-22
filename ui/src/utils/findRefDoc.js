import references from '../../../generated/references.json';

/**
 * Look up the reference document identified by the parameters.  For reference
 * types without an apiVersion, that parameter can be omitted.
 */
export default ({ type, serviceName, apiVersion }) => {
  // first, find the schema for this reference type
  const schemaEntry = references.find(
    ({ content }) =>
      content.$schema === '/schemas/common/metadata-metaschema.json#' &&
      content.metadata.name === type
  );

  if (!schemaEntry) {
    throw new Error(`No such reference type ${type}`);
  }

  const schemaId = schemaEntry.content.$id;
  // now find the document with that schemaId and the given
  // serviceName/apiVersion
  const refEntry = references.find(
    ({ content }) =>
      content.$schema === schemaId &&
      content.serviceName === serviceName &&
      (!apiVersion || content.apiVersion === apiVersion)
  );

  if (!refEntry) {
    throw new Error(
      `No reference document found of type ${type} for service ${serviceName} ${apiVersion ||
        '(no version)'}`
    );
  }

  return {
    ref: refEntry.content,
    version: schemaEntry.content.metadata.version,
  };
};
