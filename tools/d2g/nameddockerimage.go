package d2g

import (
	"github.com/taskcluster/shell"
	"github.com/taskcluster/taskcluster/v88/tools/d2g/genericworker"
)

func (ndi *NamedDockerImage) FileMounts() ([]genericworker.FileMount, error) {
	return []genericworker.FileMount{}, nil
}

func (ndi *NamedDockerImage) String(shellEscape bool) string {
	if shellEscape {
		return shell.Escape(ndi.Name)
	}
	return ndi.Name
}
