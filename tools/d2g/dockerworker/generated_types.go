// This source code file is AUTO-GENERATED by github.com/taskcluster/jsonschema2go

package dockerworker

import (
	"encoding/json"

	tcclient "github.com/taskcluster/taskcluster/v88/clients/client-go"
)

type (
	Artifact struct {
		Expires tcclient.Time `json:"expires,omitzero"`

		Path string `json:"path"`

		// Possible values:
		//   * "file"
		//   * "directory"
		//   * "volume"
		Type string `json:"type"`
	}

	// Set of capabilities that must be enabled or made available to the task container Example: ```{ "capabilities": { "privileged": true }```
	Capabilities struct {

		// Allows devices from the host system to be attached to a task container similar to using `--device` in docker.
		Devices Devices `json:"devices,omitzero"`

		// Allowed a task to run without seccomp, similar to running docker with `--security-opt seccomp=unconfined`.  This only worked for worker-types configured to enable it. NO LONGER SUPPORTED IN DOCKER WORKER, but payload still includes feature in order for d2g to work with it.
		//
		// Default:    false
		DisableSeccomp bool `json:"disableSeccomp" default:"false"`

		// Allows a task to run in a privileged container, similar to running docker with `--privileged`.  This only works for worker-types configured to enable it.
		//
		// Default:    false
		Privileged bool `json:"privileged" default:"false"`
	}

	// Allows devices from the host system to be attached to a task container similar to using `--device` in docker.
	Devices struct {

		// Mount /dev/shm from the host in the container.
		HostSharedMemory bool `json:"hostSharedMemory,omitempty"`

		// Mount /dev/kvm from the host in the container.
		KVM bool `json:"kvm,omitempty"`

		// Audio loopback device created using snd-aloop
		LoopbackAudio bool `json:"loopbackAudio,omitempty"`

		// Video loopback device created using v4l2loopback.
		LoopbackVideo bool `json:"loopbackVideo,omitempty"`
	}

	// Image to use for the task.  Images can be specified as an image tag as used by a docker registry, or as an object declaring type and name/namespace
	DockerImageArtifact struct {
		Path string `json:"path"`

		TaskID string `json:"taskId"`

		// Possible values:
		//   * "task-image"
		Type string `json:"type"`
	}

	// Image to use for the task.  Images can be specified as an image tag as used by a docker registry, or as an object declaring type and name/namespace
	DockerImageName string

	// `.payload` field of the queue.
	DockerWorkerPayload struct {

		// Artifact upload map example: ```{"public/build.tar.gz": {"path": "/home/worker/build.tar.gz", "expires": "2016-05-28T16:12:56.693817Z", "type": "file"}}```
		// Artifacts can be an individual `file`, a `directory` containing
		// potentially multiple files with recursively included subdirectories,
		// or a `volume` (d2g only) which will create a volume mount from the
		// host to the running container. Unlike `directory` artifacts, the
		// `volume` directory will already exist as the task starts. Since the
		// artifacts will be created directly on the host, they do not need to
		// be copied from the container to the host prior to being published,
		// so perform more efficiently, and simplify the d2g-generated task payload.
		// Moreover, in the case of time-critical spot terminations, tasks have
		// more chance of successfully publishing volume artifacts than directory
		// artifacts, due to the efficiency gain.
		Artifacts map[string]Artifact `json:"artifacts,omitempty"`

		// Caches are mounted within the docker container at the mount point specified. Example: ```{ "CACHE NAME": "/mount/path/in/container" }```
		//
		// Map entries:
		Cache map[string]string `json:"cache,omitempty"`

		// Set of capabilities that must be enabled or made available to the task container Example: ```{ "capabilities": { "privileged": true }```
		Capabilities Capabilities `json:"capabilities,omitzero"`

		// Example: `['/bin/bash', '-c', 'ls']`.
		//
		// Default:    []
		//
		// Array items:
		Command []string `json:"command,omitempty"`

		// Example: ```
		// {
		//   "PATH": '/borked/path'
		//   "ENV_NAME": "VALUE"
		// }
		// ```
		//
		// Map entries:
		Env map[string]string `json:"env,omitempty"`

		// Used to enable additional functionality.
		Features FeatureFlags `json:"features,omitzero"`

		// Image to use for the task.  Images can be specified as an image tag as used by a docker registry, or as an object declaring type and name/namespace
		//
		// One of:
		//   * DockerImageName
		//   * NamedDockerImage
		//   * IndexedDockerImage
		//   * DockerImageArtifact
		Image json.RawMessage `json:"image"`

		// Specifies a custom name for the livelog artifact. Note that this is also used in determining the name of the backing log artifact name. Backing log artifact name matches livelog artifact name with `_backing` appended, prior to the file extension (if present). For example, `apple/banana.log.txt` results in livelog artifact `apple/banana.log.txt` and backing log artifact `apple/banana.log_backing.txt`. Defaults to `public/logs/live.log`.
		//
		// Default:    "public/logs/live.log"
		Log string `json:"log" default:"public/logs/live.log"`

		// Maximum time the task container can run in seconds.
		//
		// Mininum:    1
		MaxRunTime int64 `json:"maxRunTime"`

		// By default docker-worker will fail a task with a non-zero exit status without retrying.  This payload property allows a task owner to define certain exit statuses that will be marked as a retriable exception.
		OnExitStatus ExitStatusHandling `json:"onExitStatus,omitzero"`

		// Maintained for backward compatibility, but no longer used
		SupersederURL string `json:"supersederUrl,omitempty"`
	}

	// By default docker-worker will fail a task with a non-zero exit status without retrying.  This payload property allows a task owner to define certain exit statuses that will be marked as a retriable exception.
	ExitStatusHandling struct {

		// If the task exits with a purge caches exit status, all caches associated with the task will be purged.
		//
		// Array items:
		PurgeCaches []int64 `json:"purgeCaches,omitempty"`

		// If the task exits with a retriable exit status, the task will be marked as an exception and a new run created.
		//
		// Array items:
		Retry []int64 `json:"retry,omitempty"`
	}

	// Used to enable additional functionality.
	FeatureFlags struct {

		// This allows you to use the Linux ptrace functionality inside the container; it is otherwise disallowed by Docker's security policy.
		//
		// Default:    false
		AllowPtrace bool `json:"allowPtrace" default:"false"`

		// Default:    true
		Artifacts bool `json:"artifacts" default:"true"`

		// Useful if live logging is not interesting but the overalllog is later on
		//
		// Default:    true
		BulkLog bool `json:"bulkLog" default:"true"`

		// Artifacts named chain-of-trust.json and chain-of-trust.json.sig should be generated which will include information for downstream tasks to build a level of trust for the artifacts produced by the task and the environment it ran in.
		//
		// Default:    false
		ChainOfTrust bool `json:"chainOfTrust" default:"false"`

		// Runs docker-in-docker and binds `/var/run/docker.sock` into the container. Doesn't allow privileged mode, capabilities or host volume mounts.
		//
		// Default:    false
		Dind bool `json:"dind" default:"false"`

		// Uploads docker images as artifacts
		//
		// Default:    false
		DockerSave bool `json:"dockerSave" default:"false"`

		// This allows you to interactively run commands inside the container and attaches you to the stdin/stdout/stderr over a websocket. Can be used for SSH-like access to docker containers.
		//
		// Default:    false
		Interactive bool `json:"interactive" default:"false"`

		// Logs are stored on the worker during the duration of tasks and available via http chunked streaming then uploaded to s3
		//
		// Default:    true
		LocalLiveLog bool `json:"localLiveLog" default:"true"`

		// The auth proxy allows making requests to taskcluster/queue and taskcluster/scheduler directly from your task with the same scopes as set in the task. This can be used to make api calls via the [client](https://github.com/taskcluster/taskcluster-client) CURL, etc... Without embedding credentials in the task.
		//
		// Default:    false
		TaskclusterProxy bool `json:"taskclusterProxy" default:"false"`
	}

	// Image to use for the task.  Images can be specified as an image tag as used by a docker registry, or as an object declaring type and name/namespace
	IndexedDockerImage struct {
		Namespace string `json:"namespace"`

		Path string `json:"path"`

		// Possible values:
		//   * "indexed-image"
		Type string `json:"type"`
	}

	// Image to use for the task.  Images can be specified as an image tag as used by a docker registry, or as an object declaring type and name/namespace
	NamedDockerImage struct {
		Name string `json:"name"`

		// Possible values:
		//   * "docker-image"
		Type string `json:"type"`
	}
)

// Returns json schema for the payload part of the task definition. Please
// note we use a go string and do not load an external file, since we want this
// to be *part of the compiled executable*. If this sat in another file that
// was loaded at runtime, it would not be burned into the build, which would be
// bad for the following two reasons:
//  1. we could no longer distribute a single binary file that didn't require
//     installation/extraction
//  2. the payload schema is specific to the version of the code, therefore
//     should be versioned directly with the code and *frozen on build*.
//
// Run `generic-worker show-payload-schema` to output this schema to standard
// out.
func JSONSchema() string {
	return `{
  "$id": "/schemas/docker-worker/v1/payload.json#",
  "$schema": "http://json-schema.org/draft-06/schema#",
  "additionalProperties": false,
  "definitions": {
    "artifact": {
      "additionalProperties": false,
      "properties": {
        "expires": {
          "format": "date-time",
          "title": "Date when artifact should expire must be in the future.",
          "type": "string"
        },
        "path": {
          "title": "Location of artifact in container, as an absolute path.",
          "type": "string"
        },
        "type": {
          "enum": [
            "file",
            "directory",
            "volume"
          ],
          "title": "Artifact upload type.",
          "type": "string"
        }
      },
      "required": [
        "type",
        "path"
      ],
      "type": "object"
    }
  },
  "description": "` + "`" + `.payload` + "`" + ` field of the queue.",
  "properties": {
    "artifacts": {
      "additionalProperties": {
        "$ref": "#/definitions/artifact"
      },
      "description": "Artifact upload map example: ` + "`" + `` + "`" + `` + "`" + `{\"public/build.tar.gz\": {\"path\": \"/home/worker/build.tar.gz\", \"expires\": \"2016-05-28T16:12:56.693817Z\", \"type\": \"file\"}}` + "`" + `` + "`" + `` + "`" + `\nArtifacts can be an individual ` + "`" + `file` + "`" + `, a ` + "`" + `directory` + "`" + ` containing\npotentially multiple files with recursively included subdirectories,\nor a ` + "`" + `volume` + "`" + ` (d2g only) which will create a volume mount from the\nhost to the running container. Unlike ` + "`" + `directory` + "`" + ` artifacts, the\n` + "`" + `volume` + "`" + ` directory will already exist as the task starts. Since the\nartifacts will be created directly on the host, they do not need to\nbe copied from the container to the host prior to being published,\nso perform more efficiently, and simplify the d2g-generated task payload.\nMoreover, in the case of time-critical spot terminations, tasks have\nmore chance of successfully publishing volume artifacts than directory\nartifacts, due to the efficiency gain.",
      "title": "Artifacts",
      "type": "object"
    },
    "cache": {
      "additionalProperties": {
        "type": "string"
      },
      "description": "Caches are mounted within the docker container at the mount point specified. Example: ` + "`" + `` + "`" + `` + "`" + `{ \"CACHE NAME\": \"/mount/path/in/container\" }` + "`" + `` + "`" + `` + "`" + `",
      "title": "Caches to mount point mapping.",
      "type": "object"
    },
    "capabilities": {
      "additionalProperties": false,
      "description": "Set of capabilities that must be enabled or made available to the task container Example: ` + "`" + `` + "`" + `` + "`" + `{ \"capabilities\": { \"privileged\": true }` + "`" + `` + "`" + `` + "`" + `",
      "properties": {
        "devices": {
          "additionalProperties": false,
          "description": "Allows devices from the host system to be attached to a task container similar to using ` + "`" + `--device` + "`" + ` in docker.",
          "properties": {
            "hostSharedMemory": {
              "description": "Mount /dev/shm from the host in the container.",
              "title": "Host shared memory device (Experimental)",
              "type": "boolean"
            },
            "kvm": {
              "description": "Mount /dev/kvm from the host in the container.",
              "title": "/dev/kvm device (Experimental)",
              "type": "boolean"
            },
            "loopbackAudio": {
              "description": "Audio loopback device created using snd-aloop",
              "title": "Loopback Audio device",
              "type": "boolean"
            },
            "loopbackVideo": {
              "description": "Video loopback device created using v4l2loopback.",
              "title": "Loopback Video device",
              "type": "boolean"
            }
          },
          "required": [],
          "title": "Devices to be attached to task containers",
          "type": "object"
        },
        "disableSeccomp": {
          "default": false,
          "description": "Allowed a task to run without seccomp, similar to running docker with ` + "`" + `--security-opt seccomp=unconfined` + "`" + `.  This only worked for worker-types configured to enable it. NO LONGER SUPPORTED IN DOCKER WORKER, but payload still includes feature in order for d2g to work with it.",
          "title": "Container does not have a seccomp profile set. NO LONGER SUPPORTED IN DOCKER WORKER.",
          "type": "boolean"
        },
        "privileged": {
          "default": false,
          "description": "Allows a task to run in a privileged container, similar to running docker with ` + "`" + `--privileged` + "`" + `.  This only works for worker-types configured to enable it.",
          "title": "Privileged container",
          "type": "boolean"
        }
      },
      "required": [],
      "title": "Capabilities that must be available/enabled for the task container.",
      "type": "object"
    },
    "command": {
      "default": [],
      "description": "Example: ` + "`" + `['/bin/bash', '-c', 'ls']` + "`" + `.",
      "items": {
        "type": "string"
      },
      "title": "Docker command to run (see docker api).",
      "type": "array"
    },
    "env": {
      "additionalProperties": {
        "type": "string"
      },
      "description": "Example: ` + "`" + `` + "`" + `` + "`" + `\n{\n  \"PATH\": '/borked/path'\n  \"ENV_NAME\": \"VALUE\"\n}\n` + "`" + `` + "`" + `` + "`" + `",
      "title": "Environment variable mappings.",
      "type": "object"
    },
    "features": {
      "additionalProperties": false,
      "description": "Used to enable additional functionality.",
      "properties": {
        "allowPtrace": {
          "default": false,
          "description": "This allows you to use the Linux ptrace functionality inside the container; it is otherwise disallowed by Docker's security policy.",
          "title": "Allow ptrace within the container",
          "type": "boolean"
        },
        "artifacts": {
          "default": true,
          "description": "",
          "title": "Artifact uploads",
          "type": "boolean"
        },
        "bulkLog": {
          "default": true,
          "description": "Useful if live logging is not interesting but the overalllog is later on",
          "title": "Bulk upload the task log into a single artifact",
          "type": "boolean"
        },
        "chainOfTrust": {
          "default": false,
          "description": "Artifacts named chain-of-trust.json and chain-of-trust.json.sig should be generated which will include information for downstream tasks to build a level of trust for the artifacts produced by the task and the environment it ran in.",
          "title": "Enable generation of ed25519-signed Chain of Trust artifacts",
          "type": "boolean"
        },
        "dind": {
          "default": false,
          "description": "Runs docker-in-docker and binds ` + "`" + `/var/run/docker.sock` + "`" + ` into the container. Doesn't allow privileged mode, capabilities or host volume mounts.",
          "title": "Docker in Docker",
          "type": "boolean"
        },
        "dockerSave": {
          "default": false,
          "description": "Uploads docker images as artifacts",
          "title": "Docker save",
          "type": "boolean"
        },
        "interactive": {
          "default": false,
          "description": "This allows you to interactively run commands inside the container and attaches you to the stdin/stdout/stderr over a websocket. Can be used for SSH-like access to docker containers.",
          "title": "Docker Exec Interactive",
          "type": "boolean"
        },
        "localLiveLog": {
          "default": true,
          "description": "Logs are stored on the worker during the duration of tasks and available via http chunked streaming then uploaded to s3",
          "title": "Enable live logging (worker local)",
          "type": "boolean"
        },
        "taskclusterProxy": {
          "default": false,
          "description": "The auth proxy allows making requests to taskcluster/queue and taskcluster/scheduler directly from your task with the same scopes as set in the task. This can be used to make api calls via the [client](https://github.com/taskcluster/taskcluster-client) CURL, etc... Without embedding credentials in the task.",
          "title": "Taskcluster auth proxy service",
          "type": "boolean"
        }
      },
      "required": [],
      "title": "Feature flags",
      "type": "object"
    },
    "image": {
      "description": "Image to use for the task.  Images can be specified as an image tag as used by a docker registry, or as an object declaring type and name/namespace",
      "oneOf": [
        {
          "title": "Docker image name",
          "type": "string"
        },
        {
          "additionalProperties": false,
          "properties": {
            "name": {
              "type": "string"
            },
            "type": {
              "enum": [
                "docker-image"
              ],
              "type": "string"
            }
          },
          "required": [
            "type",
            "name"
          ],
          "title": "Named docker image",
          "type": "object"
        },
        {
          "additionalProperties": false,
          "properties": {
            "namespace": {
              "type": "string"
            },
            "path": {
              "type": "string"
            },
            "type": {
              "enum": [
                "indexed-image"
              ],
              "type": "string"
            }
          },
          "required": [
            "type",
            "namespace",
            "path"
          ],
          "title": "Indexed docker image",
          "type": "object"
        },
        {
          "additionalProperties": false,
          "properties": {
            "path": {
              "type": "string"
            },
            "taskId": {
              "type": "string"
            },
            "type": {
              "enum": [
                "task-image"
              ],
              "type": "string"
            }
          },
          "required": [
            "type",
            "taskId",
            "path"
          ],
          "title": "Docker image artifact",
          "type": "object"
        }
      ],
      "title": "Docker image."
    },
    "log": {
      "default": "public/logs/live.log",
      "description": "Specifies a custom name for the livelog artifact. Note that this is also used in determining the name of the backing log artifact name. Backing log artifact name matches livelog artifact name with ` + "`" + `_backing` + "`" + ` appended, prior to the file extension (if present). For example, ` + "`" + `apple/banana.log.txt` + "`" + ` results in livelog artifact ` + "`" + `apple/banana.log.txt` + "`" + ` and backing log artifact ` + "`" + `apple/banana.log_backing.txt` + "`" + `. Defaults to ` + "`" + `public/logs/live.log` + "`" + `.",
      "title": "Livelog artifact name",
      "type": "string"
    },
    "maxRunTime": {
      "description": "Maximum time the task container can run in seconds.",
      "minimum": 1,
      "multipleOf": 1,
      "title": "Maximum run time in seconds",
      "type": "integer"
    },
    "onExitStatus": {
      "additionalProperties": false,
      "description": "By default docker-worker will fail a task with a non-zero exit status without retrying.  This payload property allows a task owner to define certain exit statuses that will be marked as a retriable exception.",
      "properties": {
        "purgeCaches": {
          "description": "If the task exits with a purge caches exit status, all caches associated with the task will be purged.",
          "items": {
            "title": "Exit statuses",
            "type": "integer"
          },
          "title": "Purge caches exit status",
          "type": "array"
        },
        "retry": {
          "description": "If the task exits with a retriable exit status, the task will be marked as an exception and a new run created.",
          "items": {
            "title": "Exit statuses",
            "type": "integer"
          },
          "title": "Retriable exit statuses",
          "type": "array"
        }
      },
      "required": [],
      "title": "Exit status handling",
      "type": "object"
    },
    "supersederUrl": {
      "description": "Maintained for backward compatibility, but no longer used",
      "title": "(unused)",
      "type": "string"
    }
  },
  "required": [
    "image",
    "maxRunTime"
  ],
  "title": "Docker worker payload",
  "type": "object"
}`
}
