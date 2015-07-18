/**
 * This module defines a mapping from keys to value that can be rendered into
 * JSON schemas using render-schema.js from utils
 *
 * This enables us to reuse the same slugid-pattern everywhere we define slugids
 * but give a different description of each occurrence. It makes it easy to
 * maintain consistent schemas without using `$ref`s for every single pattern
 * that can be reused.
 */
module.exports = {
  // github-identifier pattern, min and max length, these limitations are applied to
  // all common github-identifiers. It's not personal, it's just that without these
  // limitation, the github-identifiers won't be useful as routing keys in RabbitMQ
  // topic exchanges. Specifically, the length limitation and the fact that
  // github-identifiers can't contain dots `.` is critical.
  "github-identifier-pattern":     "^([a-zA-Z0-9-_%]*)$",
  "github-identifier-min-length":  1,
  "github-identifier-max-length":  100,

  // Message version numbers
  "message-version": {
    "description":  "Message version",
    "enum":         [1]
  },

  // Slugid pattern, for when-ever that is useful
  "slugid-pattern":  "^[a-zA-Z0-9-_]{22}$",
};
