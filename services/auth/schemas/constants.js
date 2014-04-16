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
  // Identifier pattern, min and max length, these limitations are applied to
  // all common identifiers. It's not personal, it's just that without these
  // limitation, the identifiers won't be useful as routing keys in RabbitMQ
  // topic exchanges. Specifically, the length limitation and the fact that
  // identifiers can't contain dots `.` is critical.
  "identifier-pattern":     "^([a-zA-Z0-9-_]*)$",
  "identifier-min-length":  1,
  "identifier-max-length":  22,

  // Message version numbers
  "message-version": {
    "description":  "Message version",
    "enum":         ["0.2.0"]
  },

  // Slugid pattern, for when-ever that is useful
  "slugid-pattern":  "^[a-zA-Z0-9-_]{22}",

  // Task-graph State
  "state": {
    "description":  "Task-graph state, this enum is **frozen** new values will " +
                    "**not** be added.",
    "enum":         ["running", "blocked", "finished"]
  },

  // Task-graph specific routing key, also prefixed to all task-specific routing
  // keys along with taskGraphId and schedulerId
  "routing": {
    "title":        "Routing Key",
    "description":  "Task-graph specific routing key, may contain dots (`.`) for arbitrary sub-routes",
    "type":         "string",
    "maxLength":    10
  },
};