package d2g

import (
	"github.com/taskcluster/shell"
	"github.com/taskcluster/taskcluster/v82/tools/d2g/genericworker"
)

func (ndi *NamedDockerImage) FileMounts() ([]genericworker.FileMount, error) {
	return []genericworker.FileMount{}, nil
}

func (ndi *NamedDockerImage) String() string {
	return shell.Escape(ndi.Name)
}

func (ndi *NamedDockerImage) ImageLoader() ImageLoader {
	return &RegistryImageLoader{
		Image: ndi,
	}
}
