import {
  binaryTag,
  CORE_SCHEMA,
  loadAll,
  mergeTag,
  omapTag,
  pairsTag,
  timestampTag,
  YAMLException,
} from 'js-yaml';

/**
 * Keep in sync with the one in services/github/src/constants.js
 */
const schema = CORE_SCHEMA.withTags(
  mergeTag,
  timestampTag,
  binaryTag,
  omapTag,
  pairsTag
);

export default schema;

/**
 * Like `yaml.load`, but returns undefined for an empty or comment-only input
 * instead of throwing.
 */
export const loadOptionalDocument = text => {
  const [document, ...rest] = loadAll(text, { schema });

  if (rest.length) {
    throw new YAMLException(
      'expected a single document in the stream, but found more'
    );
  }

  return document;
};
