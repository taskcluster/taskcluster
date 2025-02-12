package d2g

import (
	"fmt"

	"github.com/taskcluster/shell"
	"github.com/taskcluster/taskcluster/v81/tools/d2g/genericworker"
)

func (ndi *NamedDockerImage) FileMounts() ([]genericworker.FileMount, error) {
	return []genericworker.FileMount{}, nil
}

func (ndi *NamedDockerImage) String() (string, error) {
	return shell.Escape(ndi.Name), nil
}

func (ndi *NamedDockerImage) LoadCommands() []string {
	image, _ := ndi.String()
	return []string{
		fmt.Sprintf("docker pull %s", image),
	}
}
