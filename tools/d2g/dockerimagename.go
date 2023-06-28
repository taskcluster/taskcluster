package d2g

import (
	"github.com/taskcluster/shell"

	"github.com/taskcluster/taskcluster/v54/tools/d2g/genericworker"
)

func (din *DockerImageName) PrepareCommands() []string {
	return []string{}
}

func (din *DockerImageName) FileMounts() ([]genericworker.FileMount, error) {
	return []genericworker.FileMount{}, nil
}

func (din *DockerImageName) String() (string, error) {
	return shell.Escape(string(*din)), nil
}
