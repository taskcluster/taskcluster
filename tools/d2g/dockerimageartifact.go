package d2g

import (
	"encoding/json"
	"fmt"

	"github.com/taskcluster/taskcluster/v65/tools/d2g/genericworker"
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

func (dia *DockerImageArtifact) String() (string, error) {
	return "docker-archive:dockerimage", nil
}
