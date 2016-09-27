package client

import (
	"crypto/sha1"
	"hash"
	"net/http"
	"strconv"
	"testing"

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

	request := &http.Request{
		Method:     credentialsTests[0].method,
		RequestURI: credentialsTests[0].url,
		Host:       credentialsTests[0].host + ":" + strconv.Itoa(credentialsTests[0].port),
		Header:     http.Header{"Authorization": {credentialsTests[0].hdr}},
	}
	if credentialsTests[0].hash != nil {
		panic(credentialsTests[0].hash)
	}
	credentials.SignRequest(request, credentialsTests[0].hash)
	auth, errors := credentials.newAuth(credentialsTests[0].method, credentialsTests[0].url, credentialsTests[0].hash)
	assert.Equal(nil, errors)
	assert.Equal(auth.RequestHeader(), `Hawk id="1", ts="1353788437", nonce="k3j4h2", mac="zy79QQ5/EYFmQqutVnYb73gAc/U=", ext="hello"`)
}
