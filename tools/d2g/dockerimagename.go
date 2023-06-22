package d2g

import (
	"github.com/taskcluster/d2g/genericworker"
	"github.com/taskcluster/shell"
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
