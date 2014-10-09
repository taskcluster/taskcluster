var features = require('../lib/features');

// Create a schema out of the features list...
var featureSchema = {
  "title": "Feature flags",
  "description": "Used to enable additional functionality.",
  "type": "object",
  "properties": {}

};
for (var key in features) {
  var feature = features[key];
  featureSchema.properties[key] = {
    "type": "boolean",
    "title": feature.title,
    "description": feature.description,
    "default": feature.default
  };
}

module.exports = {
  "id": "http://schemas.taskcluster.net/docker-worker/v1/payload.json#",
  "$schema": "http://json-schema.org/draft-04/schema#",
  "definitions": {
    "artifact": {
      "type": "object",
      "properties": {
        "type": {
          "title": "Artifact upload type.",
          "type": "string",
          "enum": ["file", "directory"]
        },
        "path": {
          "title": "Location of artifact in container.",
          "type": "string"
        },
        "expires": {
          "title": "Date when artifact should expire must be in the future.",
          "type": "string",
          "format": "date-time"
        }
      },
      "required": ["type", "path", "expires"]
    }
  },
  "title": "Docker worker payload",
  "description": "`.payload` field of the queue.",
  "type": "object",
  "required": ["image", "command", "maxRunTime"],
  "properties": {
    "image": {
      "title": "Docker image.",
      "description": "Image to use for the task (registry.xfoo/user/image)."
    },
    "cache": {
      "title": "Caches to mount point mapping.",
      "description": "Caches are mounted within the docker container at the mount point specified. Example: ```{ \"CACHE NAME\": \"/mount/path/in/container\" }```",
      "type": "object",
    },
    "command": {
      "title": "Docker command to run (see docker api).",
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "string"
      },
      "description": "Example: `['/bin/bash', '-c', 'ls']`."
    },
    "env": {
      "title": "Environment variable mappings.",
      "description": "Example: ```\n{\n  \"PATH\": '/borked/path' \n  \"ENV_NAME\": \"VALUE\" \n}\n```",
      "type": "object"
    },
    "maxRunTime": {
      "type": "number",
      "title": "Maximum run time in seconds",
      "description": "Maximum time the task container can run in seconds",
      "multipleOf": "1.0",
      "minimum": "1",
      "maximum": "86400"
    },
    "graphs": {
      "type": "array",
      "title": "Paths (in the container) to a json files which are used to extend the task graph",
      "description": "Contents of file are used to extend the graph (if this task was part of a graph). See http://docs.taskcluster.net/scheduler/api-docs/#extendTaskGraph",
      "items": {
        "title": "Individual path to graph extension point.",
        "type": "string"
      }
    },
    "artifacts": {
      "type": "object",
      "title": "Artifact map (name -> source)",
      "description": "Artifact upload map example: ```{ \"hosts\": \"/etc/hosts\" }```",
      "additionalProperties": {
        "$ref": "#/definitions/artifact"
      }
    },
    "features": featureSchema
  }
}
