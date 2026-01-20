package mocktc

import (
	"testing"

	tcclient "github.com/taskcluster/taskcluster/v96/clients/client-go"
	"github.com/taskcluster/taskcluster/v96/clients/client-go/tcauth"
	"github.com/taskcluster/taskcluster/v96/clients/client-go/tcindex"
	"github.com/taskcluster/taskcluster/v96/clients/client-go/tcobject"
	"github.com/taskcluster/taskcluster/v96/clients/client-go/tcqueue"
	"github.com/taskcluster/taskcluster/v96/clients/client-go/tcsecrets"
	"github.com/taskcluster/taskcluster/v96/clients/client-go/tcworkermanager"
	"github.com/taskcluster/taskcluster/v96/internal/mocktc/tc"
)

type ServiceFactory struct {
	auth          tc.Auth
	queue         tc.Queue
	index         tc.Index
	secrets       tc.Secrets
	purgeCache    tc.PurgeCache
	workerManager tc.WorkerManager
	object        tc.Object
}

func NewServiceFactory(t *testing.T) *ServiceFactory {
	t.Helper()
	creds := &tcclient.Credentials{
		ClientID:    "test-client-id",
		AccessToken: "test-access-token",
	}
	rootURL := "http://localhost:13243"

	return &ServiceFactory{
		auth:          tcauth.New(creds, rootURL),
		index:         tcindex.New(creds, rootURL),
		queue:         tcqueue.New(creds, rootURL),
		secrets:       tcsecrets.New(creds, rootURL),
		purgeCache:    NewPurgeCache(t),
		workerManager: tcworkermanager.New(creds, rootURL),
		object:        tcobject.New(creds, rootURL),
	}
}

func (sf *ServiceFactory) Auth(creds *tcclient.Credentials, rootURL string) tc.Auth {
	return sf.auth
}

func (sf *ServiceFactory) Index(creds *tcclient.Credentials, rootURL string) tc.Index {
	return sf.index
}

func (sf *ServiceFactory) Queue(creds *tcclient.Credentials, rootURL string) tc.Queue {
	return sf.queue
}

func (sf *ServiceFactory) Secrets(creds *tcclient.Credentials, rootURL string) tc.Secrets {
	return sf.secrets
}

func (sf *ServiceFactory) PurgeCache(creds *tcclient.Credentials, rootURL string) tc.PurgeCache {
	return sf.purgeCache
}

func (sf *ServiceFactory) WorkerManager(creds *tcclient.Credentials, rootURL string) tc.WorkerManager {
	return sf.workerManager
}

func (sf *ServiceFactory) Object(creds *tcclient.Credentials, rootURL string) tc.Object {
	return sf.object
}
