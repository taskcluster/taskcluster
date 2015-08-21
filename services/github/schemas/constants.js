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
  "slugid-pattern":  "^[a-zA-Z0-9-_]{22}$",

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
  },

  "metadata": {
    "title":         "Meta-data",
    "description":   "Required task metadata",
    "type":           "object",
    "default": {
        "name": "TaskCluster GitHub Graph",
        "description": "A task graph submitted by the TaskCluster GitHub worker.",
        "owner": "{{ headUserEmail }}",
        "source": "{{ headRepoUrl }}"
    },
    "properties": {
      "name": {
        "title":       "Name",
        "description": "Human readable name of task, used to very briefly given  "+
                     "an idea about what the task does.",
        "type":        "string",
        "maxLength":   255,
      },
      "description": {
        "title":       "Description",
        "description": "Human readable description of the task, please  "+
                     "**explain** what the task does. A few lines of  "+
                     "documentation is not going to hurt you.",
        "type":        "string",
        "maxLength":   32768,
      },
      "owner": {
        "title":       "Owner",
        "description": "E-mail of person who caused this task, e.g. the  "+
                     "person who did `hg push`. The person we should  "+
                     "contact to ask why this task is here.",
        "type":        "string",
        "format":      "email",
        "maxLength":   255,
      },
      "source": {
        "title":       "Source",
        "description": "Link to source of this task, should specify a file,  "+
                     "revision and repository. This should be place someone  "+
                     "can go an do a git/hg blame to who came up with recipe  "+
                     "for this task.",
        "type":        "string",
        "format":      "uri",
        "maxLength":   4096,
      }
    },
    "additionalProperties": false
  },
};
