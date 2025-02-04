package d2g

import (
	"fmt"

	"github.com/taskcluster/shell"

	"github.com/taskcluster/taskcluster/v80/tools/d2g/genericworker"
)

func (din *DockerImageName) FileMounts() ([]genericworker.FileMount, error) {
	return []genericworker.FileMount{}, nil
}

func (din *DockerImageName) String() (string, error) {
	return shell.Escape(string(*din)), nil
}

func (din *DockerImageName) LoadCommands() []string {
	image, _ := din.String()
	return []string{
		fmt.Sprintf("docker pull %s", image),
	}
}
