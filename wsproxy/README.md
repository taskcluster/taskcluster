# wsproxy
--
    import "github.com/taskcluster/websocktunnel/wsproxy"

Package wsproxy is a Layer-7 proxy implementation which uses WebSockets to
communicate with clients. Incoming http and websocket requests are multiplexed
as separate streams over a WS connection. It uses JWT for auth.

browser ----> [ proxy ] <--- websocket --- client

proxy serves endpoints exposed by client to browsers.

## Usage

```go
var (
	// ErrUnexpectedSigningMethod is returned when the signing method used by the given JWT is not HMAC.
	ErrUnexpectedSigningMethod = errors.New("unexpected signing method on jwt")

	// ErrTokenNotValid is returned when the jwt is not valid.
	ErrTokenNotValid = errors.New("token not valid")

	// ErrAuthFailed is returned when jwt verification fails.
	ErrAuthFailed = errors.New("auth failed")

	// ErrMissingSecret is returned when the proxy does not load both required secrets.
	ErrMissingSecret = errors.New("both secrets must be loaded")
)
```

#### func  New

```go
func New(conf Config) (http.Handler, error)
```
New creates a new proxy instance and wraps it as an http.Handler.

#### type Config

```go
type Config struct {
	// Upgrader is a websocket.Upgrader instance which is used to upgrade incoming
	// websocket connections from Clients.
	Upgrader websocket.Upgrader

	// Logger is used to log proxy events. Refer util.Logger.
	Logger util.Logger

	// JWTSecretA and JWTSecretB are used by the proxy to verify JWTs from Clients.
	JWTSecretA []byte
	JWTSecretB []byte
}
```

Config contains the run time parameters for the proxy
