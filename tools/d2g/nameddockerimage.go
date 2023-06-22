package d2g

import (
	"github.com/taskcluster/d2g/genericworker"
	"github.com/taskcluster/shell"
)

func (ndi *NamedDockerImage) PrepareCommands() []string {
	return []string{}
}

func (ndi *NamedDockerImage) FileMounts() ([]genericworker.FileMount, error) {
	return []genericworker.FileMount{}, nil
}

func (ndi *NamedDockerImage) String() (string, error) {
	return shell.Escape(ndi.Name), nil
}
