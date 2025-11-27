package d2g

import (
	"github.com/taskcluster/taskcluster/v94/tools/d2g/genericworker"
)

func (ndi *NamedDockerImage) FileMounts() ([]genericworker.FileMount, error) {
	return []genericworker.FileMount{}, nil
}

func (ndi *NamedDockerImage) String() string {
	return ndi.Name
}
