/**
 * This module defines a mapping from keys to value that can be rendered into
 * JSON schemas using {$const: "my-key"}
 *
 * This enables us to reuse the same slugid-pattern everywhere we define slugids
 * but give a different description of each occurrence. It makes it easy to
 * maintain consistent schemas without using `$ref`s for every single pattern
 * that can be reused.
 */
module.exports = {
  // Things like clientId
  "identifier-pattern":       "^[a-zA-Z0-9_-]{1,22}$",
  "access-token-pattern":     "^[a-zA-Z0-9_-]{22,66}$",
  // Printable ascii string for roleId
  "roleId": "^[\\x20-\\x7e]+$",

  "clientId": "^[A-Za-z0-9@/:._-]+$",

  // Slugid pattern, for when-ever that is useful
  "slugid-pattern":           "^[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-]" +
                              "[CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$",

  "message-version": {
    enum: [1],
    description: "Message version number"
  }
};
