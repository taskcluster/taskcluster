package d2g

import "github.com/taskcluster/d2g/genericworker"

func (idi *IndexedDockerImage) PrepareCommands() []string {
	return []string{}
}

func (idi *IndexedDockerImage) FileMounts() ([]genericworker.FileMount, error) {
	return []genericworker.FileMount{}, nil
}

func (idi *IndexedDockerImage) String() (string, error) {
	return "", nil
}
