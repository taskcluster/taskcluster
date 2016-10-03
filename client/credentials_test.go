package client

import (
	"crypto/sha1"
	"hash"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestCredentials(t *testing.T) {

	assert := assert.New(t)

	credentials := &Credentials{
		ClientID:    "tester",
		AccessToken: "no-secret",
	}

	type CredentialsTests struct {
		method string
		url    string
		host   string
		port   int
		hdr    string
		now    int64
		perr   error
		verr   error
		key    string
		hash   hash.Hash
		reply  bool
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

	request, _ := http.NewRequest(testCredentials.method, testCredentials.url, nil)
	credentials.SignRequest(request, testCredentials.hash)
	auth, errors := credentials.newAuth(testCredentials.method, testCredentials.url, testCredentials.hash)
	auth.Timestamp = time.Unix(testCredentials.now, 0)
	auth.MAC = []byte(testCredentials.key)
	auth.Ext = testCredentials.ext
	auth.Nonce = testCredentials.nonce
	assert.Equal(nil, errors)
	assert.Equal(auth.RequestHeader(), testCredentials.hdr)

}
