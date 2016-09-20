package client

import (
	"testing"
	"strconv"	
)

func TestCredentials(t *testing.T){

	cred := &Credentials{
		ClientID          : "tester"
		AccessToken       : "no-secret"
	}

	var credentialsTests = []struct {
		meth string
		url  string
		host string
		port int
		hdr  string
		now  int64
		perr error
		verr error
		key  string
		hash func() hash.Hash
		rply bool
	}
	{
		{
			hdr:  `Hawk id="1", ts="1353788437", nonce="k3j4h2", mac="zy79QQ5/EYFmQqutVnYb73gAc/U=", ext="hello"`,
			hash: sha1.New,
		},
	}

	for k, test := range credentialsTests {
			if test.meth == "" {
				test.meth = "GET"
			}
			if test.url == "" {
				test.url = "/resource/4?filter=a"
			}
			if test.host == "" {
				test.host = "example.com"
			}
			if test.port == 0 {
				test.port = 8080
			}
			if test.now == 0 {
				test.now = 1353788437
			}
			if test.hash == nil {
				test.hash = sha256.New
			}
			if test.key == "" {
				test.key = "werxhqb98rpaxn39848xrunpaw3489ruxnpa98w4rxn"
			}
	}

	request := &http.Request{
				Method:     test.meth,
				RequestURI: test.url,
				Host:       test.host + ":" + strconv.Itoa(test.port),
				Header:     http.Header{"Authorization": {test.hdr}},
			}

	cred.SignRequest(request,test.hash)
	auth, errors := cred.newAuth(test.meth , test.url,test.hash)
	t.assert(errors,nil)
}