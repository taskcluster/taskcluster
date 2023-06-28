package d2g

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/taskcluster/shell"
	"github.com/taskcluster/taskcluster/v54/tools/d2g/genericworker"
)

func (idi *IndexedDockerImage) PrepareCommands() []string {
	findArtifactURL := fmt.Sprintf("${TASKCLUSTER_PROXY_URL}/index/v1/task/%s/artifacts/%s", idi.Namespace, idi.Path)
	filename := filepath.Base(idi.Path)
	commands := []string{
		fmt.Sprintf(`curl -fsSL -o %s "%s"`, filename, findArtifactURL),
	}

	handleFileExtentions(filename, &commands)

	return commands
}

func (idi *IndexedDockerImage) FileMounts() ([]genericworker.FileMount, error) {
	return []genericworker.FileMount{}, nil
}

func (idi *IndexedDockerImage) String() (string, error) {
	return `"${IMAGE_NAME}"`, nil
}

func handleFileExtentions(filename string, commands *[]string) {
	switch lowerExt := strings.ToLower(filepath.Ext(filename)); lowerExt {
	case ".lz4":
		*commands = append(
			*commands,
			// TODO handle spaces in file name
			"unlz4 "+shell.Escape(filename),
			// TODO handle spaces in file name
			"rm "+shell.Escape(filename),
		)
		filename = filename[:len(filename)-len(lowerExt)]
	case ".zst":
		*commands = append(
			*commands,
			// TODO handle spaces in file name
			"unzstd "+shell.Escape(filename),
			// TODO handle spaces in file name
			"rm "+shell.Escape(filename),
		)
		filename = filename[:len(filename)-len(lowerExt)]
	}

	*commands = append(
		*commands,
		// TODO handle spaces in file name
		"IMAGE_NAME=$(podman load -i "+shell.Escape(filename)+" | sed -n 's/.*: //p')",
	)
}
