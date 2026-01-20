package tc

import (
	tcclient "github.com/taskcluster/taskcluster/v96/clients/client-go"
	"github.com/taskcluster/taskcluster/v96/clients/client-go/tcauth"
	"github.com/taskcluster/taskcluster/v96/clients/client-go/tcindex"
	"github.com/taskcluster/taskcluster/v96/clients/client-go/tcobject"
	"github.com/taskcluster/taskcluster/v96/clients/client-go/tcpurgecache"
	"github.com/taskcluster/taskcluster/v96/clients/client-go/tcqueue"
	"github.com/taskcluster/taskcluster/v96/clients/client-go/tcsecrets"
	"github.com/taskcluster/taskcluster/v96/clients/client-go/tcworkermanager"
)

type ServiceFactory interface {
	Auth(creds *tcclient.Credentials, rootURL string) Auth
	Index(creds *tcclient.Credentials, rootURL string) Index
	Queue(creds *tcclient.Credentials, rootURL string) Queue
	Object(creds *tcclient.Credentials, rootURL string) Object
	PurgeCache(creds *tcclient.Credentials, rootURL string) PurgeCache
	Secrets(creds *tcclient.Credentials, rootURL string) Secrets
	WorkerManager(creds *tcclient.Credentials, rootURL string) WorkerManager
}

type ClientFactory struct {
}

func (cf *ClientFactory) Auth(creds *tcclient.Credentials, rootURL string) Auth {
	return tcauth.New(creds, rootURL)
}

func (cf *ClientFactory) Index(creds *tcclient.Credentials, rootURL string) Index {
	return tcindex.New(creds, rootURL)
}

func (cf *ClientFactory) PurgeCache(creds *tcclient.Credentials, rootURL string) PurgeCache {
	return tcpurgecache.New(creds, rootURL)
}

func (cf *ClientFactory) Queue(creds *tcclient.Credentials, rootURL string) Queue {
	return tcqueue.New(creds, rootURL)
}

func (cf *ClientFactory) Object(creds *tcclient.Credentials, rootURL string) Object {
	return tcobject.New(creds, rootURL)
}

func (cf *ClientFactory) Secrets(creds *tcclient.Credentials, rootURL string) Secrets {
	return tcsecrets.New(creds, rootURL)
}

func (cf *ClientFactory) WorkerManager(creds *tcclient.Credentials, rootURL string) WorkerManager {
	return tcworkermanager.New(creds, rootURL)
}
