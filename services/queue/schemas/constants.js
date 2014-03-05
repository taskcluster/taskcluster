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

  // Task State
  "state": {
    "description":  "Task state, this enum is **frozen** new values will " +
                    "**not** be added. Please, note, that `completed` does " +
                    "not imply task-specfic success, and `failed` means that " +
                    "we were unable to run the task to completion on " +
                    "available infrastructure. See `reason` for explanation.",
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
  "min-run-id":     1,
  "max-run-id":     1000,

  // Task-specific routing key
  "routing": {
    "title":        "Routing Key",
    "description":  "Task specific routing key, may contain dots (`.`) for arbitrary sub-routes",
    "type":         "string",
    "maxLength":    64
  },

  // Maximum number of retries allowed by the format, if we allow it grow higher
  // we need to consider RabbitMQ routing key limitations. We might not have
  // used all bytes yet, but keep this in mind!
  "max-retries":    999,

  // Priority of a task, for task.json
  "priority": {
    "title":        "Priority",
    "description":  "Task priority",
    "type":         "number"
  },

  // Deadline of task
  "deadline": {
    "title":        "Deadline",
    "description":  "Deadline of the task, a task is resolved as **failed** " +
                    "if it haven't be resolved by other means before the " +
                    "deadline",
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
    "enum":         ["0.2.0"]
  },

  // Slugid pattern, for when-ever that is useful
  "slugid-pattern":  "^[a-zA-Z0-9-_]{22}"
};