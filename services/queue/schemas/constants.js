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

  // Run State
  "state": {
    "description":  "Run state, this enum is **frozen** new values will " +
                    "**not** be added. Please, note, that `completed` does " +
                    "not imply task-specfic success, and `failed` means that " +
                    "we were unable to execute the run to completion on " +
                    "available infrastructure. See `reasonResolved` for " +
                    "explanation.",
    "enum":         ["pending", "running", "completed", "failed"]
  },

  // Identifier pattern, min and max length, these limitations are applied to
  // all common identifiers. It's not personal, it's just that without these
  // limitation, the identifiers won't be useful as routing keys in RabbitMQ
  // topic exchanges. Specifically, the length limitation and the fact that
  // identifiers can't contain dots `.` is critical.
  "identifier-pattern":     "^([a-zA-Z0-9-_]*)$",
  "identifier-min-length":  1,
  "identifier-max-length":  22,

  // Run identifier limitations, these are also somewhat founded in RabbitMQ
  // routing key limitations
  "min-run-id":     0,
  "max-run-id":     1000,

  // Task-specific routing key
  "routing": {
    "title":        "Routing Key",
    "description":  "Task specific routing key, may contain dots (`.`) for arbitrary sub-routes",
    "type":         "string",
    "maxLength":    128
  },

  // Maximum number of retries allowed by the format, if we allow it grow higher
  // we need to consider RabbitMQ routing key limitations. We might not have
  // used all bytes yet, but keep this in mind!
  "max-retries":    999,

  // Deadline of task
  "deadline": {
    "title":        "Deadline",
    "description":  "Deadline of the task, `pending` and `running` runs are " +
                    "resolved as **failed** if not resolved by other means " +
                    "before the deadline. Note, deadline cannot be more than" +
                    "5 days into the future",
    "type":         "string",
    "format":       "date-time"
  },

  // Expiration of task
  "expires": {
    "title":        "Expiration",
    "description":  "Task expiration, time at which task definition and " +
                    "status is deleted. Notice that all artifacts for the " +
                    "must have an expiration that is no later than this.",
    "type":         "string",
    "format":       "date-time"
  },

  // Creation time of tasks
  "created": {
    "title":        "Created",
    "description":  "Creation time of task",
    "type":         "string",
    "format":       "date-time"
  },

  // Message version numbers
  "message-version": {
    "description":  "Message version",
    "enum":         [1]
  },

  // Slugid pattern, for when-ever that is useful
  "slugid-pattern":  "^[A-Za-z0-9_-]{8}[Q-T][A-Za-z0-9_-][CGKOSWaeimquy26-][A-Za-z0-9_-]{10}[AQgw]$",

  // Pattern for scope names, for when-ever that is useful
  "scope-pattern":   "^[\\x20-\\x7e]*$",
};
