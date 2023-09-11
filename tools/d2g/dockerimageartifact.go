package d2g

import (
	"encoding/json"
	"fmt"
	"path/filepath"

	"github.com/taskcluster/taskcluster/v55/tools/d2g/genericworker"
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
			// TODO check if this could conflict with other files(?)
			File: filepath.Base(dia.Path),
		},
	}, nil
}

func (dia *DockerImageArtifact) String() (string, error) {
	return fmt.Sprintf("docker-archive:%s", filepath.Base(dia.Path)), nil
}
