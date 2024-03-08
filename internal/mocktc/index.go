package mocktc

import (
	"testing"

	"github.com/taskcluster/taskcluster/v60/clients/client-go/tcindex"
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
	payload := index.entries[indexPath]
	return &tcindex.IndexedTaskResponse{
		Data:      payload.Data,
		Expires:   payload.Expires,
		Namespace: indexPath,
		Rank:      payload.Rank,
		TaskID:    payload.TaskID,
	}, nil
}

func (index *Index) InsertTask(namespace string, payload *tcindex.InsertTaskRequest) (*tcindex.IndexedTaskResponse, error) {
	index.entries[namespace] = payload
	return &tcindex.IndexedTaskResponse{
		Data:      payload.Data,
		Expires:   payload.Expires,
		Namespace: namespace,
		Rank:      payload.Rank,
		TaskID:    payload.TaskID,
	}, nil
}
