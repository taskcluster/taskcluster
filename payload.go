// +build !windows

package main

// Returns json schema for the payload part of the task definition. Please
// note we use a go string and do not load an external file, since we want this
// to be *part of the compiled executable*. If this sat in another file that
// was loaded at runtime, it would not be burned into the build, which would be
// bad for the following two reasons:
//  1) we could no longer distribute a single binary file that didn't require
//     installation/extraction
//  2) the payload schema is specific to the version of the code, therefore
//     should be versioned directly with the code and *frozen on build*.
//
// Run `generic-worker show-payload-schema` to output this schema to standard
// out.
func taskPayloadSchema() string {
	return `{
  "id": "http://schemas.taskcluster.net/generic-worker/v1/payload.json#",
  "$schema": "http://json-schema.org/draft-04/schema#",
  "title": "Generic worker payload",
  "description": "This schema defines the structure of the ` + "`payload`" + ` property referred to in a\nTaskCluster Task definition.",
  "type": "object",
  "required": [
    "command",
    "maxRunTime"
  ],
  "additionalProperties": false,
  "properties": {
    "command": {
      "title": "Commands to run",
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "array",
        "minItems": 1,
        "items": {
          "type": "string"
        }
      },
	  "description": "One array per command (each command is an array of arguments). Several arrays\nfor several commands."
    },
    "env": {
      "title": "Environment variable mappings.",
	  "description": "Example: ` + "```" + `{ \"PATH\": \"C:\\\\Windows\\\\system32;C:\\\\Windows\", \"GOOS\": \"darwin\" }` + "```" + `",
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
    "artifacts": {
      "type": "array",
      "title": "Artifacts to be published",
	  "description": "Artifacts to be published. For example:\n` + "`" + `{ \"type\": \"file\", \"path\": \"builds\\\\firefox.exe\", \"expires\": \"2015-08-19T17:30:00.000Z\" }` + "`" + `",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "type": {
            "title": "Artifact upload type.",
            "type": "string",
            "enum": ["file", "directory"],
			"description": "Artifacts can be either an individual ` + "`file`" + ` or a ` + "`directory`" + ` containing\npotentially multiple files with recursively included subdirectories."
          },
          "path": {
            "title": "Artifact location",
            "type": "string",
            "description": "Filesystem path of artifact"
          },
          "expires": {
            "title": "Expiry date and time",
            "type": "string",
            "format": "date-time",
            "description": "Date when artifact should expire must be in the future"
          }
        },
        "required": ["type", "path", "expires"]
      }
    },
    "features": {
      "title": "Feature flags",
      "description": "Feature flags enable additional functionality.",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "chainOfTrust": {
          "type": "boolean",
          "title": "Enable generation of a openpgp signed Chain of Trust artifact",
          "description": "An artifact named chainOfTrust.json.asc should be generated\nwhich will include information for downstream tasks to build\na level of trust for the artifacts produced by the task and\nthe environment it ran in."
        }
      }
    }
  }
}`
}
