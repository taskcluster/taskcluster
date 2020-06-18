package mocktc

import (
	"testing"

	tcclient "github.com/taskcluster/taskcluster/v31/clients/client-go"
	"github.com/taskcluster/taskcluster/v31/clients/client-go/tcauth"
	"github.com/taskcluster/taskcluster/v31/clients/client-go/tcqueue"
	"github.com/taskcluster/taskcluster/v31/clients/client-go/tcsecrets"
	"github.com/taskcluster/taskcluster/v31/clients/client-go/tcworkermanager"
	"github.com/taskcluster/taskcluster/v31/workers/generic-worker/tc"
)

type ServiceFactory struct {
	auth          tc.Auth
	queue         tc.Queue
	secrets       tc.Secrets
	purgeCache    tc.PurgeCache
	workerManager tc.WorkerManager
}

func NewServiceFactory(t *testing.T) *ServiceFactory {
	creds := &tcclient.Credentials{
		ClientID:    "test-client-id",
		AccessToken: "test-access-token",
	}
	rootURL := "http://localhost:13243"

	return &ServiceFactory{
		auth:          tcauth.New(creds, rootURL),
		queue:         tcqueue.New(creds, rootURL),
		secrets:       tcsecrets.New(creds, rootURL),
		purgeCache:    NewPurgeCache(t),
		workerManager: tcworkermanager.New(creds, rootURL),
	}
}

func (sf *ServiceFactory) Auth(creds *tcclient.Credentials, rootURL string) tc.Auth {
	return sf.auth
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
