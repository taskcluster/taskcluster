package expose

// Expose local HTTP servers and ports via
// [websocktunnel](https://github.com/taskcluster/taskcluster/v92/tools/websocktunnel).
//
// The strategy here is to create a distinct websocktunnel client for each
// exposure.  The tunnel clientId is based on this worker's workerGroup,
// workerId (neither of which can contain `.`), and the exposed port, so the
// worker's TC credentials must include
// `auth:websocktunnel-token:<wstAudience>/<workerGroup>.<workerId>.*`.

import (
	"fmt"
	"net/http"
	"net/url"

	"github.com/taskcluster/taskcluster/v92/internal/mocktc/tc"
	"github.com/taskcluster/taskcluster/v92/tools/websocktunnel/client"
)

type wstExposer struct {
	serverURL         string
	wstAudience       string
	workerGroup       string
	workerId          string
	authClientFactory func() tc.Auth
}

// Create a websocktunnel-based exposer implementation.
func NewWST(serverURL, wstAudience, workerGroup, workerId string, authClientFactory func() tc.Auth) (Exposer, error) {
	return &wstExposer{
		serverURL:         serverURL,
		wstAudience:       wstAudience,
		workerGroup:       workerGroup,
		workerId:          workerId,
		authClientFactory: authClientFactory,
	}, nil
}

func (exposer *wstExposer) ExposeHTTP(targetPort uint16) (Exposure, error) {
	exposure := &wstExposure{exposer: exposer, targetPort: targetPort, isHTTP: true}

	err := exposure.start()
	if err != nil {
		return nil, err
	}
	return exposure, nil
}

func (exposer *wstExposer) ExposeTCPPort(targetPort uint16) (Exposure, error) {
	exposure := &wstExposure{exposer: exposer, targetPort: targetPort, isHTTP: false}

	err := exposure.start()
	if err != nil {
		return nil, err
	}
	return exposure, nil
}

// wstExposure exposes either an HTTP server or a TCP port
type wstExposure struct {
	exposer    *wstExposer
	targetPort uint16
	isHTTP     bool

	// the websocktunnel client carrying this connection
	wstClient *client.Client
}

func (exposure *wstExposure) start() error {
	wstClient, err := client.New(func() (client.Config, error) {
		wstClientId := fmt.Sprintf("%s.%s.%d", exposure.exposer.workerGroup, exposure.exposer.workerId, exposure.targetPort)
		tokenResponse, err := exposure.exposer.authClientFactory().WebsocktunnelToken(
			exposure.exposer.wstAudience, wstClientId)
		if err != nil {
			return client.Config{}, err
		}
		// note that we ignore the "expires" value, as we simply generate a new
		// token each time we need one

		return client.Config{
			ID:         wstClientId,
			TunnelAddr: exposure.exposer.serverURL,
			Token:      tokenResponse.Token,
			// The link between the websocktunnel and exposure is set-up in this hook to ensure that
			// it is rebuilt if the websocktunnel client reconnects for any reason. Without this, the
			// websocktunnel link does not work properly after a reconnect, causing things like live
			// logs and interative tasks to stop working part way through tasks.
			ConnectHook: func(cl *client.Client) {
				if exposure.isHTTP {
					// forward connections via the websocktunnel to the target port; these will all be
					// HTTP connections
					go forwardPort(cl, fmt.Sprintf("127.0.0.1:%d", exposure.targetPort))
				} else {
					// forward websocket connections at path / to the local port
					server := http.Server{
						Handler: websocketToTCPHandlerFunc(exposure.targetPort),
					}
					go func() {
						_ = server.Serve(cl)
					}()
				}
			},
		}, nil
	})
	if err != nil {
		return err
	}
	exposure.wstClient = wstClient

	return nil
}

func (exposure *wstExposure) Close() error {
	return exposure.wstClient.Close()
}

func (exposure *wstExposure) GetURL() *url.URL {
	url, _ := url.Parse(exposure.wstClient.URL())
	return url
}
