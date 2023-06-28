package d2g

import (
	"encoding/json"
	"fmt"
	"path/filepath"

	"github.com/taskcluster/taskcluster/v54/tools/d2g/genericworker"
)

func (dia *DockerImageArtifact) PrepareCommands() []string {
	commands := []string{}
	filename := filepath.Base(dia.Path)
	handleFileExtentions(filename, &commands)
	// if filepath.Ext(strings.ToLower(filename)) != ".tar" {
	//	return fmt.Errorf("docker image artifact %q has an unsupported file extension - only support .tar, .tar.lz4, .tar.zst", dia.Path)
	// }
	return commands
}

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
	return `"${IMAGE_NAME}"`, nil
}
