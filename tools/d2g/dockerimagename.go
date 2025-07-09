package d2g

import (
	"github.com/taskcluster/shell"
	"github.com/taskcluster/taskcluster/v87/tools/d2g/genericworker"
)

func (din *DockerImageName) FileMounts() ([]genericworker.FileMount, error) {
	return []genericworker.FileMount{}, nil
}

func (din *DockerImageName) String() string {
	return shell.Escape(string(*din))
}

func (din *DockerImageName) ImageLoader() ImageLoader {
	return &RegistryImageLoader{
		Image: din,
	}
}
