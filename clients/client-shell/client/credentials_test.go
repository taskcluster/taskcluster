package client

import (
	"crypto/sha1"
	"hash"
	http "net/http/httptest"
	"testing"
	"time"

	tcclient "github.com/taskcluster/taskcluster/v92/clients/client-go"

	assert "github.com/stretchr/testify/require"
)

var credentials = &Credentials{
	ClientID:    "tester",
	AccessToken: "no-secret",
}

func TestCredentialsAuth(t *testing.T) {
	assert := assert.New(t)

	type CredentialsTests struct {
		method string
		url    string
		host   string
		port   int
		hdr    string
		now    int64
		key    string
		hash   hash.Hash
		nonce  string
		ext    string
	}

	testCredentials := &CredentialsTests{
		hdr:    `Hawk id="tester", mac="oA/FLh//qt/xu+eE8f8ikM8aDWBm1eMc+torOHKPuFQ=", ts="1353788437", nonce="k3j4h2", hash="cYU8YZemp/Ii2w8ZeMfLIyuHxe4=", ext="hello"`,
		hash:   sha1.New(),
		method: "POST",
		url:    "https://auth.taskcluster.net/v1/test-authenticate",
		host:   "example.com",
		port:   8080,
		now:    1353788437,
		key:    "Jcelngt+a8loOSi7f7M9vCgdxBsXT4o+6kwkEqSMONg=",
		nonce:  "k3j4h2",
		ext:    "hello",
	}

	request := http.NewRequest(testCredentials.method, testCredentials.url, nil)
	assert.NoError(credentials.SignRequest(request, testCredentials.hash))

	auth, err := credentials.newAuth(testCredentials.method, testCredentials.url, testCredentials.hash)
	assert.NoError(err, "err should be nothing")

	auth.Timestamp = time.Unix(testCredentials.now, 0)
	auth.MAC = []byte(testCredentials.key)
	auth.Ext = testCredentials.ext
	auth.Nonce = testCredentials.nonce

	assert.Equal(auth.RequestHeader(), testCredentials.hdr)
}

func TestCredentialsToTCC(t *testing.T) {
	assert := assert.New(t)

	testTCCCredentials := &tcclient.Credentials{
		ClientID:    credentials.ClientID,
		AccessToken: credentials.AccessToken,
	}
	creds := credentials.ToClientCredentials()

	assert.IsType(&tcclient.Credentials{}, creds, "credentials should be of correct type")
	assert.Equal(testTCCCredentials, creds, "credentials should match")
}
