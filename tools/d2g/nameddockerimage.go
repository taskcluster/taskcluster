package d2g

import (
	"fmt"

	"github.com/taskcluster/shell"
	"github.com/taskcluster/taskcluster/v78/tools/d2g/genericworker"
)

func (ndi *NamedDockerImage) FileMounts(tool string) ([]genericworker.FileMount, error) {
	return []genericworker.FileMount{}, nil
}

func (ndi *NamedDockerImage) String(tool string) (string, error) {
	return shell.Escape(ndi.Name), nil
}

func (ndi *NamedDockerImage) LoadCommands(tool string) []string {
	image, _ := ndi.String(tool)
	return []string{
		fmt.Sprintf("%s pull %s", tool, image),
	}
}
