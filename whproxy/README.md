# whproxy
--
    import "github.com/taskcluster/webhooktunnel/whproxy"


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


#### type Proxy

```go
type Proxy struct {
}
```

Proxy is used to send http and ws requests to workers. New proxy can be created
by using whproxy.New()

#### func  New

```go
func New(conf Config) *Proxy
```
New creates a new proxy instance using the provided configuration.

#### func (*Proxy) LoadSecretsFromEnv

```go
func (p *Proxy) LoadSecretsFromEnv() error
```
LoadSecretsFromEnv loads jwt secrets from environment variables. Environment
variables must be: TASKCLUSTER_PROXY_SECRET_A="a secret"
TASKCLUSTER_PROXY_SECRET_B="another secret"

#### func (*Proxy) ServeHTTP

```go
func (p *Proxy) ServeHTTP(w http.ResponseWriter, r *http.Request)
```
ServeHTTP implements http.Handler so that the proxy may be used as a handler in
a Mux or http.Server

#### func (*Proxy) SetSessionRemoveHandler

```go
func (p *Proxy) SetSessionRemoveHandler(h func(string))
```
SetSessionRemoveHandler sets a function which is called when a wsmux Session is
removed from the proxy due to closure or error.
