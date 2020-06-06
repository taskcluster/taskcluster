package mocktc

import (
	"testing"

	"github.com/taskcluster/taskcluster/v30/clients/client-go/tcauth"
)

type Auth struct {
}

/////////////////////////////////////////////////

func (auth *Auth) ExpandScopes(payload *tcauth.SetOfScopes) (*tcauth.SetOfScopes, error) {
	return &tcauth.SetOfScopes{}, nil
}

func (auth *Auth) SentryDSN(project string) (*tcauth.SentryDSNResponse, error) {
	return &tcauth.SentryDSNResponse{}, nil
}

func (auth *Auth) WebsocktunnelToken(wstAudience, wstClient string) (*tcauth.WebsocktunnelTokenResponse, error) {
	return &tcauth.WebsocktunnelTokenResponse{}, nil
}

/////////////////////////////////////////////////

func NewAuth(t *testing.T) *Auth {
	a := &Auth{}
	return a
}
