package mocktc

import (
	"testing"

	"github.com/taskcluster/taskcluster/v94/clients/client-go/tcpurgecache"
)

type PurgeCache struct {
}

/////////////////////////////////////////////////

func (purgeCache *PurgeCache) PurgeRequests(workerPoolId, since string) (*tcpurgecache.OpenPurgeRequestList, error) {
	return &tcpurgecache.OpenPurgeRequestList{}, nil
}

/////////////////////////////////////////////////

func NewPurgeCache(t *testing.T) *PurgeCache {
	t.Helper()
	pc := &PurgeCache{}
	return pc
}
