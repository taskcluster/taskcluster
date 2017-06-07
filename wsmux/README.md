# wsmux
--
    import "github.com/taskcluster/webhooktunnel/wsmux"


## Usage

```go
const (
	// DefaultCapacity of read buffer.
	DefaultCapacity = 1024
)
```

```go
var (

	// ErrAcceptTimeout is returned when the Accept operation times out
	ErrAcceptTimeout = errors.New("accept timed out")

	// ErrBrokenPipe is returned when data cannot be written to or read from a stream
	ErrBrokenPipe = errors.New("broken pipe")

	// ErrWriteTimeout if the write operation on a stream times out
	ErrWriteTimeout = errors.New("wsmux: write operation timed out")

	// ErrReadTimeout if the read operation on a stream times out
	ErrReadTimeout = errors.New("wsmux: read operation timed out")

	// ErrNoCapacity is returns if the read buffer is full and a session attempts to load
	// more data into the buffer
	ErrNoCapacity = errors.New("buffer does not have capacity to accomodate extra data")

	// ErrDuplicateStream is returned when a duplicate stream is found
	ErrDuplicateStream = errors.New("duplicate stream")

	//ErrSessionClosed is returned when a closed session tries to create a new stream
	ErrSessionClosed = errors.New("session closed")

	//ErrInvalidDeadline is returned when the time is before the current time
	ErrInvalidDeadline = errors.New("invalid deadline")

	//ErrKeepAliveExpired is returned when the keep alive timer expired
	ErrKeepAliveExpired = errors.New("keep alive timer expired")
)
```

#### type Config

```go
type Config struct {
	// KeepAliveInterval is the interval between keepAlives.
	// Default: 10 seconds
	KeepAliveInterval time.Duration

	// StreamAcceptDeadline is the time after which a stream will time out and not be accepted.
	// Default: 30 seconds
	StreamAcceptDeadline time.Duration

	// CloseCallback is a callback function which is invoked when the session is closed.
	CloseCallback func()

	// Log must implement util.Logger. This defaults to NilLogger.
	Log util.Logger

	// StreamBufferSize sets the maximum buffer size of streams created by the session.
	// Default: 1024 bytes
	StreamBufferSize int
}
```

Config contains run time parameters for Session

#### type Session

```go
type Session struct {
}
```

Session allows creating and accepting wsmux streams over a websocket connection.
Session implements net.Listener

#### func  Client

```go
func Client(conn *websocket.Conn, conf Config) *Session
```
Client instantiates a new client session over a websocket connection. There must
only be one client session over a websocket connection.

#### func  Server

```go
func Server(conn *websocket.Conn, conf Config) *Session
```
Server instantiates a new server session over a websocket connection. There can
only be one Server session over a websocket connection.

#### func (*Session) Accept

```go
func (s *Session) Accept() (net.Conn, error)
```
Accept is used to accept an incoming stream.

#### func (*Session) Addr

```go
func (s *Session) Addr() net.Addr
```
Addr used for implementing net.Listener

#### func (*Session) Close

```go
func (s *Session) Close() error
```
Close closes the current session and underlying connection.

#### func (*Session) IsClosed

```go
func (s *Session) IsClosed() bool
```
IsClosed returns true if the session is closed.

#### func (*Session) Open

```go
func (s *Session) Open() (net.Conn, error)
```
Open creates a new stream to the remote session.

#### func (*Session) SetCloseCallback

```go
func (s *Session) SetCloseCallback(h func())
```
SetCloseCallback sets the function which is called when the session is closed
