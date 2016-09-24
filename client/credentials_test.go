package client

import (
	"testing"
	"strconv"
	"github.com/stretchr/testify/assert"	
)

func TestCredentials(t *testing.T){

	 assert := assert.New(t)

	credentials := &Credentials{
		ClientID          : "tester" ,
		AccessToken       : "no-secret",
	}

	var credentialsTests = []struct {
		method string
		url  string
		host string
		port int
		hdr  string
		now  int64
		perr error
		verr error
		key  string
		hash func() hash.Hash
		reply bool
	}
	{
		{
			hdr:  `Hawk id="1", ts="1353788437", nonce="k3j4h2", mac="zy79QQ5/EYFmQqutVnYb73gAc/U=", ext="hello"`,
			hash: sha1.New,
			method : "GET",
			url : "/resource/4?filter=a",
			host : "example.com",
			port : 8080,
			now: 1353788437,
			key : "werxhqb98rpaxn39848xrunpaw3489ruxnpa98w4rxn",
		},
	}

	request := &http.Request{
				Method:     credentialsTests.method,
				RequestURI: credentialsTests.url,
				Host:       credentialsTests.host + ":" + strconv.Itoa(credentialsTests.port),
				Header:     http.Header{"Authorization": {credentialsTests.hdr}},
			}

	credentials.SignRequest(request,credentialsTests.hash)
	auth, errors := credentials.newAuth(credentialsTests.method ,credentialsTests.url,credentialsTests.hash)
	assert.Nil(errors)
}