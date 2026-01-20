package mocktc

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v4"
	"github.com/taskcluster/taskcluster/v96/clients/client-go/tcauth"
)

type Auth struct {
}

/////////////////////////////////////////////////

const WST_SECRET = "sshhh!"
const WST_AUDIENCE = "testing"

func (auth *Auth) ExpandScopes(payload *tcauth.SetOfScopes) (*tcauth.SetOfScopes, error) {
	return &tcauth.SetOfScopes{}, nil
}

func (auth *Auth) SentryDSN(project string) (*tcauth.SentryDSNResponse, error) {
	return &tcauth.SentryDSNResponse{}, nil
}

func (auth *Auth) WebsocktunnelToken(wstAudience, wstClientId string) (*tcauth.WebsocktunnelTokenResponse, error) {
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"tid": wstClientId,
		"iat": time.Now().Unix(),
		"nbf": time.Now().Add(-1 * time.Minute).Unix(),
		"exp": time.Now().Add(1 * time.Minute).Unix(),
		"aud": WST_AUDIENCE,
	}).SignedString([]byte(WST_SECRET))
	if err != nil {
		return nil, err
	}

	return &tcauth.WebsocktunnelTokenResponse{
		Token: token,
	}, nil
}

/////////////////////////////////////////////////

func NewAuth(t *testing.T) *Auth {
	t.Helper()
	a := &Auth{}
	return a
}
