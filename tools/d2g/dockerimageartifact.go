package d2g

import (
	"encoding/json"
	"fmt"

	"github.com/taskcluster/taskcluster/v70/tools/d2g/genericworker"
)

func (dia *DockerImageArtifact) FileMounts() ([]genericworker.FileMount, error) {
	artifactContent := genericworker.ArtifactContent{
		Artifact: dia.Path,
		SHA256:   "", // We could add this as an optional property to docker worker schema
		TaskID:   dia.TaskID,
	}
	raw, err := json.MarshalIndent(&artifactContent, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("cannot marshal artifact content %#v into json: %w", artifactContent, err)
	}
	return []genericworker.FileMount{
		{
			Content: json.RawMessage(raw),
			// Instead of trying to preserve the artifact filename, we use a
			// hardcoded name to prevent filename collisions.
			// This _may_ cause issues once concurrent tasks are supported
			// on generic worker (see https://bugzil.la/1609102).
			File:   "dockerimage",
			Format: fileExtension(dia.Path),
		},
	}, nil
}

func (dia *DockerImageArtifact) String(tool string) (string, error) {
	switch tool {
	case "docker":
		return `"${IMAGE_ID}"`, nil
	default:
		return "docker-archive:dockerimage", nil
	}
}

func (dia *DockerImageArtifact) LoadCommands(tool string) []string {
	switch tool {
	case "docker":
		return []string{
			`IMAGE_ID=$(docker load --input dockerimage | sed -n '0,/^Loaded image: /s/^Loaded image: //p')`,
		}
	default:
		return []string{}
	}
}
