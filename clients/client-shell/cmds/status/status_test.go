package status

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/suite"
)

type FakeServerSuite struct {
	suite.Suite
	testServer *httptest.Server
}

func (suite *FakeServerSuite) SetupSuite() {
	// set up a fake server that knows how to answer the `task()` method
	handler := http.NewServeMux()
	handler.HandleFunc("/v1/ping/alive", validAlivePingHandler)
	handler.HandleFunc("/v1/ping/dead", validDeadPingHandler)
	handler.HandleFunc("/v1/ping/invalid", invalidPingHandler)

	suite.testServer = httptest.NewServer(handler)
}

func validAlivePingHandler(w http.ResponseWriter, _ *http.Request) {
	io.WriteString(w, `{ "alive": true, "uptime": 13958.262}`)
}

func validDeadPingHandler(w http.ResponseWriter, _ *http.Request) {
	io.WriteString(w, `{ "alive": false, "uptime": 13958.262}`)
}

func invalidPingHandler(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusServiceUnavailable)
}

func TestFakeServerSuite(t *testing.T) {
	suite.Run(t, new(FakeServerSuite))
}

func (suite *FakeServerSuite) TestObjectFromJSONURL() {
	var servstat PingResponse
	var err error
	url := suite.testServer.URL

	// valid alive
	err = objectFromJSONURL(url+"/v1/ping/alive", &servstat)
	suite.NoError(err, "The first ping should be valid")
	suite.True(servstat.Alive, "The first ping should be alive")

	// valid alive
	err = objectFromJSONURL(url+"/v1/ping/dead", &servstat)
	suite.NoError(err, "The second ping should be valid")
	suite.False(servstat.Alive, "The second ping should be dead")

	// invalid
	err = objectFromJSONURL(url+"/v1/ping/invalid", &servstat)
	suite.EqualError(err, "Bad (!= 200) status code 503 from "+url+"/v1/ping/invalid", "The third ping should be invalid")
}
