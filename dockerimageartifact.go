package d2g

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/taskcluster/d2g/genericworker"
	"github.com/taskcluster/shell"
)

func (dia *DockerImageArtifact) PrepareCommands() []string {
	commands := []string{}
	filename := filepath.Base(dia.Path)
	switch lowerExt := strings.ToLower(filepath.Ext(filename)); lowerExt {
	case ".lz4":
		commands = append(
			commands,
			// TODO handle spaces in file name
			"unlz4 "+shell.Escape(filename),
			// TODO handle spaces in file name
			"rm "+shell.Escape(filename),
		)
		filename = filename[:len(filename)-len(lowerExt)]
	case ".zst":
		commands = append(
			commands,
			// TODO handle spaces in file name
			"unzstd "+shell.Escape(filename),
			// TODO handle spaces in file name
			"rm "+shell.Escape(filename),
		)
		filename = filename[:len(filename)-len(lowerExt)]
	}
	// if filepath.Ext(strings.ToLower(filename)) != ".tar" {
	//	return fmt.Errorf("docker image artifact %q has an unsupported file extension - only support .tar, .tar.lz4, .tar.zst", dia.Path)
	// }
	return append(
		commands,
		// TODO handle spaces in file name
		"IMAGE_NAME=$(podman load -i "+shell.Escape(filename)+" | sed -n 's/.*: //p')",
	)
}

func (dia *DockerImageArtifact) FileMounts() ([]genericworker.FileMount, error) {
	artifactContent := genericworker.ArtifactContent{
		Artifact: dia.Path,
		Sha256:   "", // We could add this as an optional property to docker worker schema
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
