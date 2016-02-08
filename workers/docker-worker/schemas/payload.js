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
  "required": ["image", "maxRunTime"],
  "properties": {
    "image": {
      "title": "Docker image.",
      "description": "Image to use for the task.  Images can be specified as an image tag as used by a docker registry, or as an object declaring type and name/namespace",
      "oneOf": [
        {
          "type": "string",
        },
        {
          "type": "object",
          "properties": {
            "type": {
              "type": "string",
              "enum": ["docker-image"]
            },
            "name": {
              "type": "string"
            }
          },
          "required": ["type", "name"]
        },
        {
          "type": "object",
          "properties": {
            "type": {
              "type": "string",
              "enum": ["indexed-image"]
            },
            "namespace": {
              "type": "string"
            },
            "path": {
              "type": "string"
            }
          },
          "required": ["type", "namespace", "path"]
        },
        {
          "type": "object",
          "properties": {
            "type": {
              "type": "string",
              "enum": ["task-image"]
            },
            "taskId": {
              "type": "string"
            },
            "path": {
              "type": "string"
            }
          },
          "required": ["type", "taskId", "path"]
        }
      ]
    },
    "cache": {
      "title": "Caches to mount point mapping.",
      "description": "Caches are mounted within the docker container at the mount point specified. Example: ```{ \"CACHE NAME\": \"/mount/path/in/container\" }```",
      "type": "object",
    },
    "capabilities": {
      "title": "Capabilities that must be available/enabled for the task container.",
      "description": "Set of capabilities that must be enabled or made available to the task container Example: ```{ \"capabilities\": { \"privileged\": true }```",
      "type": "object",
      "properties": {
        "privileged": {
          "title": "Privileged container",
          "description": "Allows a task to run in a privileged container, similar to running docker with `--privileged`.  This only works for worker-types configured to enable it.",
          "type": "boolean",
          "default": false
        },
        "devices": {
          "title": "Devices to be attached to task containers",
          "description": "Allows devices from the host system to be attached to a task container similar to using `--device` in docker. ",
          "type": "object",
          "properties": {
            "loopbackVideo": {
              "title": "Loopback Video device",
              "description": "Video loopback device created using v4l2loopback.",
              "type": "boolean"
            },
            "loopbackAudio": {
              "title": "Loopback Audio device",
              "description": "Audio loopback device created using snd-aloop",
              "type": "boolean"
            },
            "phone": {
              "title": "Phone device",
              "description": "Phone device that will be created using Testdroid",
              "type": "object",
              "required": ["type", "sims", "build", "memory"],
              "properties": {
                "type": {
                  "title": "Phone Type",
                  "description": "Phone device type. Example: 'flame'",
                  "type": "string"
                },
                "sims": {
                  "title": "Sims",
                  "description": "Number of sims to be available in the device",
                  "type": "string"
                },
                "build": {
                  "title": "Build URL",
                  "description": "URL for the build the phone has been (or will be) flashed with",
                  "type": "string"
                },
                "memory": {
                  "title": "Device Memory",
                  "description": "The memory configuration the device to be configured with",
                  "type": "string"
                }
              }
            }
          }
        }
      }
    },
    "command": {
      "title": "Docker command to run (see docker api).",
      "type": "array",
      "items": {
        "type": "string"
      },
      "default": [],
      "description": "Example: `['/bin/bash', '-c', 'ls']`."
    },
    "encryptedEnv": {
      "title": "List of encrypted environment variable mappings.",
      "description": "List of base64 encoded asymmetric encrypted environment variables. See http://docs.taskcluster.net/docker-worker/#encrypted-environment-variables",
      "type": "array",
      "items": {
        "title": "Base64 encoded encrypted environment variable object.",
        "type": "string"
      }
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
      "multipleOf": 1.0,
      "minimum": 1,
      "maximum": 86400
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
      "description": "Artifact upload map example: ```{\"public/build.tar.gz\": {\"path\": \"/home/worker/build.tar.gz\", \"expires\": \"2016-05-28T16:12:56.693817Z\", \"type\": \"file\"}}```",
      "additionalProperties": {
        "$ref": "#/definitions/artifact"
      }
    },
    "supersederUrl": {
      "title": "URL of the a service that can indicate tasks superseding this one; the current taskId will be appended as a query argument `taskId`.  The service should return an object with a `supersedes` key containing a list of taskIds, including the supplied taskId.  The tasks should be ordered such that each task supersedes all tasks appearing earlier in the list.  See the docker-worker documentation for more detail.",
      "type": "string",
      "format": "url"
    },
    "features": featureSchema
  }
}
