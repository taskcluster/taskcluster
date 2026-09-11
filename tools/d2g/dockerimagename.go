package d2g

import (
	"github.com/taskcluster/taskcluster/v109/tools/d2g/genericworker"
)

func (din *DockerImageName) FileMounts() ([]genericworker.FileMount, error) {
	return []genericworker.FileMount{}, nil
}
