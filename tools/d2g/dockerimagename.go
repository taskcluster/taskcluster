package d2g

import (
	"github.com/taskcluster/shell"
	"github.com/taskcluster/taskcluster/v89/tools/d2g/genericworker"
)

func (din *DockerImageName) FileMounts() ([]genericworker.FileMount, error) {
	return []genericworker.FileMount{}, nil
}

func (din *DockerImageName) String(shellEscape bool) string {
	if shellEscape {
		return shell.Escape(string(*din))
	}
	return string(*din)
}
