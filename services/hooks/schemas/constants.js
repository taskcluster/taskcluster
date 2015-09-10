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

  // Task-specific routing key
  "routing": {
    "title":        "Routing Key",
    "description":  "Task specific routing key, may contain dots (`.`) for arbitrary sub-routes",
    "type":         "string",
    "maxLength":    128
  },

  // Deadline of task
  "deadline": {
    "title":        "Deadline",
    "description":  "Deadline of the task, `pending` and `running` runs are " +
                    "resolved as **failed** if not resolved by other means " +
                    "before the deadline. Note, deadline cannot be more than" +
                    "5 days into the future",
    "type":         "string",
  },

  // Expiration of task
  "expires": {
    "title":        "Expiration",
    "description":  "Task expiration, time at which task definition and " +
                    "status is deleted. Notice that all artifacts for the " +
                    "must have an expiration that is no later than this.",
    "type":         "string",
  },

  // Slugid pattern, for when-ever that is useful
  "slugid-pattern":  "^[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$",
};
