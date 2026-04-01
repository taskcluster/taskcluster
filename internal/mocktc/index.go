package mocktc

import (
	"fmt"
	"testing"

	"github.com/taskcluster/taskcluster/v99/clients/client-go/tcindex"
)

type Index struct {
	t       *testing.T
	entries map[string]*tcindex.InsertTaskRequest
}

func NewIndex(t *testing.T) *Index {
	t.Helper()
	return &Index{
		t:       t,
		entries: make(map[string]*tcindex.InsertTaskRequest),
	}
}

/////////////////////////////////////////////////

func (index *Index) FindTask(indexPath string) (*tcindex.IndexedTaskResponse, error) {
	itr, ok := index.entries[indexPath]
	if !ok {
		return nil, fmt.Errorf("indexed task not found at %q", indexPath)
	}
	return &tcindex.IndexedTaskResponse{
		Data:      itr.Data,
		Expires:   itr.Expires,
		Namespace: indexPath,
		Rank:      itr.Rank,
		TaskID:    itr.TaskID,
	}, nil
}

func (index *Index) InsertTask(namespace string, itr *tcindex.InsertTaskRequest) (*tcindex.IndexedTaskResponse, error) {
	index.entries[namespace] = itr
	return &tcindex.IndexedTaskResponse{
		Data:      itr.Data,
		Expires:   itr.Expires,
		Namespace: namespace,
		Rank:      itr.Rank,
		TaskID:    itr.TaskID,
	}, nil
}
