package d2g

import (
	"github.com/taskcluster/taskcluster/v108/tools/d2g/genericworker"
)

func (din *DockerImageName) FileMounts() ([]genericworker.FileMount, error) {
	return []genericworker.FileMount{}, nil
}

func (din *DockerImageName) String() string {
	return string(*din)
}
