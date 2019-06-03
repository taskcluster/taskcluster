package hawk

import (
	"crypto/sha1"
	"crypto/sha256"
	"encoding/base64"
	"hash"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"testing"
	"time"

	. "launchpad.net/gocheck"
)

// Hook up gocheck into the "go test" runner.
func Test(t *testing.T) { TestingT(t) }

type HawkSuite struct{}

var _ = Suite(&HawkSuite{})

var requestAuthTests = []struct {
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
}{
	{
		hdr:  `Hawk id="1", ts="1353788437", nonce="k3j4h2", mac="zy79QQ5/EYFmQqutVnYb73gAc/U=", ext="hello"`,
		hash: sha1.New,
	},
	{
		hdr:  `Hawk id="1", ts="1353788437", nonce="k3j4h2", mac="zy79QQ5/EYFmQqutVnYb73gAc/U=", ext="hello"`,
		key:  "a",
		hash: sha1.New,
		verr: ErrInvalidMAC,
	},
	{
		hdr:  `Hawk id="1", ts="1353788437", nonce="k3j4h2", mac="zy79QQ5/EYFmQqutVnYb73gAc/U=", ext="hello"`,
		hash: sha1.New,
		rply: true,
		perr: ErrReplay,
	},
	{
		hdr:  `Hawk id="dh37fgj492je", ts="1353832234", nonce="j4h3g2", mac="m8r1rHbXN6NgO+KIIhjO7sFRyd78RNGVUwehe8Cp2dU=", ext="some-app-data"`,
		url:  "/resource/1?b=1&a=2",
		now:  1353832234,
		port: 8000,
	},
	{
		hdr:  `Hawk id="123456", ts="1357926341", nonce="1AwuJD", hash="qAiXIVv+yjDATneWxZP2YCTa9aHRgQdnH9b3Wc+o3dg=", ext="some-app-data", mac="UeYcj5UoTVaAWXNvJfLVia7kU3VabxCqrccXP8sUGC4="`,
		meth: "POST",
		now:  1357926341,
	},
	{
		hdr:  `Hawk id="123456", ts="1362337299", nonce="UzmxSs", ext="some-app-data", mac="wnNUxchvvryMH2RxckTdZ/gY3ijzvccx4keVvELC61w="`,
		now:  time.Now().Unix(),
		port: 8000,
		verr: ErrTimestampSkew,
	},
	{hdr: "Basic asdasdasdasd", perr: AuthFormatError{Field: "scheme", Err: "must be Hawk"}},
	{hdr: "a", perr: AuthFormatError{Field: "scheme", Err: "must be Hawk"}},
	{perr: ErrNoAuth},
	{
		hdr:  `Hawk ts="1353788437", nonce="k3j4h2", mac="/qwS4UjfVWMcUyW6EEgUH4jlr7T/wuKe3dKijvTvSos=", ext="hello"`,
		perr: AuthFormatError{Field: "id", Err: "missing or empty"},
	},
	{
		hdr:  `Hawk id="123", nonce="k3j4h2", mac="/qwS4UjfVWMcUyW6EEgUH4jlr7T/wuKe3dKijvTvSos=", ext="hello"`,
		perr: AuthFormatError{Field: "ts", Err: "missing, empty, or zero"},
	},
	{
		hdr:  `Hawk id="123", ts="1353788437", mac="/qwS4UjfVWMcUyW6EEgUH4jlr7T/wuKe3dKijvTvSos=", ext="hello"`,
		perr: AuthFormatError{Field: "nonce", Err: "missing or empty"},
	},
	{
		hdr:  `Hawk id="123", ts="1353788437", nonce="k3j4h2", ext="hello"`,
		perr: AuthFormatError{Field: "mac", Err: "missing or empty"},
	},
	{
		hdr:  `Hawk id="123\\", ts="1353788437", nonce="k3j4h2", mac="/qwS4UjfVWMcUyW6EEgUH4jlr7T/wuKe3dKijvTvSos=", ext="hello"`,
		perr: AuthFormatError{Field: "id", Err: "cannot parse value"},
	},
	{
		// eol in value for ext
		hdr:  `Hawk id="123", ts="1353788437", nonce="k3j4h2", ext="hel`,
		perr: AuthFormatError{Field: "ext", Err: "cannot parse value"},
	},
	{
		// eol in key for nonce
		hdr:  `Hawk id="123", ts="1353788437", no`,
		perr: AuthFormatError{Field: "header", Err: "cannot parse header field"},
	},
	{url: "/resource/4?a=1&b=2&bewit=MTIzNDU2XDQ1MTE0ODQ2MjFcMzFjMmNkbUJFd1NJRVZDOVkva1NFb2c3d3YrdEVNWjZ3RXNmOGNHU2FXQT1cc29tZS1hcHAtZGF0YQ"},
	{url: "/resource/4?bewit=MTIzNDU2XDQ1MTE0ODQ2MjFcMzFjMmNkbUJFd1NJRVZDOVkva1NFb2c3d3YrdEVNWjZ3RXNmOGNHU2FXQT1cc29tZS1hcHAtZGF0YQ&a=1&b=2"},
	{url: "/resource/4?bewit=MTIzNDU2XDQ1MTE0ODQ2NDFcZm1CdkNWT3MvcElOTUUxSTIwbWhrejQ3UnBwTmo4Y1VrSHpQd3Q5OXJ1cz1cc29tZS1hcHAtZGF0YQ"},
	{
		meth: "HEAD",
		url:  "/resource/4?bewit=MTIzNDU2XDQ1MTE0ODQ2NDFcZm1CdkNWT3MvcElOTUUxSTIwbWhrejQ3UnBwTmo4Y1VrSHpQd3Q5OXJ1cz1cc29tZS1hcHAtZGF0YQ",
	},
	{
		url:  "/resource/4?a=1&b=2&bewit=MTIzNDU2XDEzNTY0MTg1ODNcWk1wZlMwWU5KNHV0WHpOMmRucTRydEk3NXNXTjFjeWVITTcrL0tNZFdVQT1cc29tZS1hcHAtZGF0YQ",
		verr: ErrBewitExpired,
		now:  time.Now().Unix(),
	},
}

func now(ts int64) func() time.Time {
	return func() time.Time { return time.Unix(ts, 0) }
}

func creds(key string, h func() hash.Hash) CredentialsLookupFunc {
	return func(creds *Credentials) error {
		creds.Key = key
		creds.Hash = h
		return nil
	}
}

func (s *HawkSuite) TestRequestAuth(c *C) {
	for i, test := range requestAuthTests {
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
		Now = now(test.now)
		nonce := func(string, time.Time, *Credentials) bool { return !test.rply }

		req := &http.Request{
			Method:     test.meth,
			RequestURI: test.url,
			Host:       test.host + ":" + strconv.Itoa(test.port),
			Header:     http.Header{"Authorization": {test.hdr}},
		}
		var err error
		req.URL, err = url.Parse(test.url)
		auth, err := NewAuthFromRequest(req, creds(test.key, test.hash), nonce)
		c.Assert(err, DeepEquals, test.perr, Commentf("test %d", i))

		if err == nil {
			err = auth.Valid()
			c.Assert(err, DeepEquals, test.verr, Commentf("test %d, %#v", i, auth.NormalizedString(AuthHeader)))
		}
	}
}

func (s *HawkSuite) TestRequestSigning(c *C) {
	u, _ := url.Parse("https://example.net/somewhere/over/the/rainbow")
	auth := NewRequestAuth(&http.Request{URL: u, Method: "POST"},
		&Credentials{ID: "123456", Key: "2983d45yun89q", Hash: sha256.New}, 0)
	auth.Nonce = "Ygvqdz"
	auth.Ext = "Bazinga!"
	auth.Timestamp = time.Unix(1353809207, 0)
	h := auth.PayloadHash("text/plain")
	h.Write([]byte("something to write about"))
	auth.SetHash(h)
	c.Assert(auth.RequestHeader(), Equals, `Hawk id="123456", mac="q1CwFoSHzPZSkbIvl0oYlD+91rBUEvFk763nMjMndj8=", ts="1353809207", nonce="Ygvqdz", hash="2QfCt3GuY9HQnHWyWD3wX68ZOKbynqlfYmuO2ZBRqtY=", ext="Bazinga!"`)
}

var responseAuthHeaderTests = []struct {
	hdr string
	err error
}{
	{err: ErrMissingServerAuth},
	{
		hdr: `Hawk mac="_IJRsMl/4oL+nn+vKoeVZPdCHXB4yJkNnBbTbHFZUYE=", hash="f9cDF/TDm7TkYRLnGwRMfeDzT6LixQVLvrIKhh0vgmM=", ext="response-specific"`,
		err: AuthFormatError{Field: "mac", Err: "malformed base64 encoding"},
	},
	{
		hdr: `Hawk mac="XIJRsMl/4oL+nn+vKoeVZPdCHXB4yJkNnBbTbHFZUYE=", hash="f9cDF/TDm7TkYRLnGwRMfeDzT6LixQVLvrIKhh0vgmM=", ext="response-specific"`,
	},
}

func (s *HawkSuite) TestResponseAuth(c *C) {
	auth := &Auth{
		Method:      "POST",
		Host:        "example.com",
		Port:        "8080",
		RequestURI:  "/resource/4?filter=a",
		Nonce:       "eb5S_L",
		Ext:         "some-app-data",
		Timestamp:   time.Unix(1362336900, 0),
		Credentials: Credentials{ID: "123456", Key: "werxhqb98rpaxn39848xrunpaw3489ruxnpa98w4rxn", Hash: sha256.New},
	}

	for i, test := range responseAuthHeaderTests {
		err := auth.ValidResponse(test.hdr)
		c.Assert(err, Equals, test.err, Commentf("test %d", i))
	}
}

func (s *HawkSuite) TestResponseHeader(c *C) {
	auth := &Auth{
		Method:      "POST",
		Host:        "example.com",
		Port:        "8080",
		RequestURI:  "/resource/4?filter=a",
		Nonce:       "eb5S_L",
		Ext:         "foo",
		Timestamp:   time.Unix(1362336900, 0),
		Credentials: Credentials{ID: "123456", Key: "werxhqb98rpaxn39848xrunpaw3489ruxnpa98w4rxn", Hash: sha256.New},
	}
	auth.Hash, _ = base64.StdEncoding.DecodeString("f9cDF/TDm7TkYRLnGwRMfeDzT6LixQVLvrIKhh0vgmM=")
	c.Assert(auth.ResponseHeader("response-specific"), Equals, `Hawk mac="XIJRsMl/4oL+nn+vKoeVZPdCHXB4yJkNnBbTbHFZUYE=", ext="response-specific", hash="f9cDF/TDm7TkYRLnGwRMfeDzT6LixQVLvrIKhh0vgmM="`)
}

func (s *HawkSuite) TestValidHash(c *C) {
	auth := &Auth{Credentials: Credentials{Hash: sha256.New}}
	auth.Hash, _ = base64.StdEncoding.DecodeString("2QfCt3GuY9HQnHWyWD3wX68ZOKbynqlfYmuO2ZBRqtY=")
	h := auth.PayloadHash("text/plain")
	h.Write([]byte("something to write about"))
	c.Assert(auth.ValidHash(h), Equals, true)
	h.Write([]byte("a"))
	c.Assert(auth.ValidHash(h), Equals, false)
}

func (s *HawkSuite) TestBewit(c *C) {
	u, _ := url.Parse("https://example.com/somewhere/over/the/rainbow")
	auth := NewRequestAuth(&http.Request{URL: u},
		&Credentials{ID: "123456", Key: "2983d45yun89q", Hash: sha256.New}, 0)
	auth.Ext = "xandyandz"
	auth.Timestamp = time.Unix(1356420707, 0)
	c.Assert(auth.Bewit(), Equals, "MTIzNDU2XDEzNTY0MjA3MDdca3NjeHdOUjJ0SnBQMVQxekRMTlBiQjVVaUtJVTl0T1NKWFRVZEc3WDloOD1ceGFuZHlhbmR6")
}

func (s *HawkSuite) TestStaleHeader(c *C) {
	Now = now(1365741469)
	auth := &Auth{Credentials: Credentials{Key: "werxhqb98rpaxn39848xrunpaw3489ruxnpa98w4rxn", Hash: sha256.New}}
	c.Assert(auth.StaleTimestampHeader(), Equals, `Hawk ts="1365741469", tsm="b4Qqhz8OUBq21saghHLV1ktwlXE72T1xtTEZkSlWizA=", error="Stale timestamp"`)
}

func (s *HawkSuite) TestUpdateOffset(c *C) {
	Now = now(0)
	auth := &Auth{Credentials: Credentials{Key: "werxhqb98rpaxn39848xrunpaw3489ruxnpa98w4rxn", Hash: sha256.New}}
	offset, err := auth.UpdateOffset(`Hawk ts="1365741469", tsm="b4Qqhz8OUBq21saghHLV1ktwlXE72T1xtTEZkSlWizA=", error="Stale timestamp"`)
	c.Assert(err, IsNil)
	c.Assert(offset, Equals, 1365741469*time.Second)
	c.Assert(auth.Timestamp.Unix(), Equals, int64(1365741469))
	c.Assert(auth.Nonce, HasLen, 8)
}

var header = `Hawk id="dh37fgj492je", ts="1353832234", nonce="j4h3g2", ext="some-app-ext-data", mac="6R4rV5iE+NPoym+WwjeHzjAGXUtLNIxmo1vpMofpLAE="`

func BenchmarkRegexParser(b *testing.B) {
	// headerRegex function previously used to parse headers
	headerRegex := regexp.MustCompile(`(id|ts|nonce|hash|ext|mac|app|dlg)="([ !#-\[\]-~]+)"`)
	for i := 0; i < b.N; i++ {
		headerRegex.FindAllStringSubmatch(header, 8)
	}
}

func BenchmarkLexingParser(b *testing.B) {
	for i := 0; i < b.N; i++ {
		lexHeader(header[4:])
	}
}
