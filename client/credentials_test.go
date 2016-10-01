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

	var credentialsTests = []struct {
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
	}{

		{
			hdr:    `Hawk id="1", ts="1353788437", nonce="k3j4h2", mac="zy79QQ5/EYFmQqutVnYb73gAc/U=", ext="hello"`,
			hash:   sha1.New(),
			method: "POST",
			url:    "https://auth.taskcluster.net/v1/test-authenticate",
			host:   "example.com",
			port:   8080,
			now:    1353788437,
			key:    "werxhqb98rpaxn39848xrunpaw3489ruxnpa98w4rxn",
		},
	}

	request, _ := http.NewRequest(credentialsTests[0].method, credentialsTests[0].url, nil)
	credentials.SignRequest(request, credentialsTests[0].hash)
	auth, errors := credentials.newAuth(credentialsTests[0].method, credentialsTests[0].url, credentialsTests[0].hash)
	auth.Timestamp = time.Unix(1475317496, 0)
	auth.MAC = []byte("Jcelngt+a8loOSi7f7M9vCgdxBsXT4o+6kwkEqSMONg=")
	assert.Equal(nil, errors)
	assert.Equal(auth.RequestHeader(), `Hawk id="tester", mac="mmUrSFCwMjlJ2rOwBhPoiVAhBuSvJX07gKwCPA8pdSE=", ts="1475317496", nonce="", hash="cYU8YZemp/Ii2w8ZeMfLIyuHxe4="`)

}
