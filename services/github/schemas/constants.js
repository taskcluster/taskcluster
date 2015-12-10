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
  // Identifier patterns, min and max length, these limitations are applied to
  // all common identifiers. It's not personal, it's just that without these
  // limitation, the identifiers won't be useful as routing keys in RabbitMQ
  // topic exchanges. Specifically, the length limitation and the fact that
  // identifiers can't contain dots `.` is critical.
  "github-identifier-pattern":     "^([a-zA-Z0-9-_%]*)$",
  "github-identifier-min-length":  1,
  "github-identifier-max-length":  100,

  "identifier-pattern":     "^([a-zA-Z0-9-_]*)$",
  "identifier-min-length":  1,
  "identifier-max-length":  22,

  // Slugid pattern, for when-ever that is useful
  // Currently allow all v4 slugs, although we only generate nice slugs
  // See https://www.npmjs.com/package/slugid for more info
  "slugid-pattern":  "^[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$",

  // Message version numbers
  "message-version": {
    "description":  "Message version",
    "enum":         [1]
  },

  // Creation time of tasks
  "created": {
    "title":        "Created",
    "description":  "Creation time of task",
    "type":         "string",
    "default":      "{{ $fromNow }}"
  },

  // Deadline of task
  "deadline": {
    "title":        "Deadline",
    "description":  "Deadline of the task, `pending` and `running` runs are " +
                    "resolved as **failed** if not resolved by other means " +
                    "before the deadline",
    "type":         "string",
    "default":      "{{ '1 day' | $fromNow }}"
  }
};
