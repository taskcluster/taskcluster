# whclient
--
    import "github.com/taskcluster/webhooktunnel/whclient"


## Usage

```go
var (
	// ErrRetryTimedOut is returned when Reconnect() time exceeds MaxElapsedTime
	ErrRetryTimedOut = errors.New("retry timed out")
)
```

#### func  TestTokenGenerator

```go
func TestTokenGenerator(id string) (string, error)
```
TestTokenGenerator is the default TokenGenerator. It creates a new JWT and sets
claim "tid" to the given id (proxy convention). "nbf" is set to 5 minutes before
the creation of the JWT and "exp" is set to 30 days after creation of JWT. The
jwt is signed using HS256 with the secret "test-secret".

#### type Client

```go
type Client struct {
}
```

Client is used to connect to a Webhook Proxy instance and create a listener for
serving API endpoints.

#### func  New

```go
func New(conf Config) *Client
```
New creates a new Client instance

#### func (*Client) GetListener

```go
func (c *Client) GetListener(retry bool) (net.Listener, error)
```
GetListener connects to the proxy and returns a net.Listener instance by
connecting to the proxy and setting up a wsmux Session.

#### type Config

```go
type Config struct {
	// ID is the worker-id of the client. This field must match the "tid" claim of the
	// JWT.
	ID string

	// ProxyAddr is the websocket address of the proxy to which the client should connect.
	ProxyAddr string

	// SessionLogger is an optional field. This logger is passed to the session created by
	// the GetListener method. This defaults to `&util.NilLogger{}`.
	SessionLogger util.Logger

	// Token is the signed JWT used for authentication.
	Token string

	// Tokenator is the TokenGenerator used by the client to generate a new JWT when needed.
	// The client may sign it's own JWT or request one from an external source. This defaults
	// to TestTokenGenerator.
	Tokenator TokenGenerator

	// Retry contains the retry parameters to use in case of reconnects.
	// The default values are specified in RetryConfig.
	Retry RetryConfig
}
```

Config is used for creating a new client.

#### type RetryConfig

```go
type RetryConfig struct {
	// InitialDelay is the delay after which the first reconnect
	// attempt takes place.
	// Default = 500 * time.Millisecond
	InitialDelay time.Duration

	// MaxDelay is the maximum possible delay between two consecutive
	// reconnect attempts.
	// Default = 60 * time.Second
	MaxDelay time.Duration

	// MaxElapsedTime is the time after which reconnect will time out
	// Default = 3 * time.Minute
	MaxElapsedTime time.Duration

	// Multplier is the rate at which the delay will increase
	//Default = 1.5
	Multiplier float64

	// RandomizationFactor is the extent to which the delay values will be randomized
	// Default = 0.5
	RandomizationFactor float64
}
```

RetryConfig contains exponential backoff parameters for retrying connections

#### func (RetryConfig) NextDelay

```go
func (r RetryConfig) NextDelay(currentDelay time.Duration) time.Duration
```
NextDelay calculates the new retry delay based on the current delay.

#### type TokenGenerator

```go
type TokenGenerator func(id string) (string, error)
```

TokenGenerator is a function which accepts a string `id` and returns a signed
JWT (JSON Web Token). If an error occurs, the return values must be ("",
ErrorGenerated).
