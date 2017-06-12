package util

import (
	"os"
)

// Logger is used by Session to write logs
type Logger interface {
	Printf(format string, a ...interface{})
	Print(a ...interface{})
}

// NilLogger implements Logger and discards all writes
type NilLogger struct{}

// Printf discards writes
func (n *NilLogger) Printf(format string, a ...interface{}) {}

// Print discards writes
func (n *NilLogger) Print(a ...interface{}) {}

// utils for generating logging messages

// proxy -- auth
// log claims

const (
	prefixProxy       = "[PROXY]"
	prefixProxyAuth   = "[PROXY:AUTH]"
	prefixProxyBridge = "[PROXY:BRIDGE]"
)

var (
	LogLevel = os.Getenv("PROXY_LOG_LEVEL")
)

func getFmtSring(prefix string, e bool) string {
	str := prefix
	if e {
		str += "[ERROR]"
	}
	str += " id=%s "
	return str
}

func ProxyAuthLog(logger Logger, id string, e bool, format string, v ...interface{}) {
	if len(v) > 0 {
		logger.Printf(getFmtSring(prefixProxyAuth, e)+format, append([]interface{}{id}, v...)...)
	} else {
		logger.Printf(getFmtSring(prefixProxyAuth, e)+format, id)
	}
}

func ProxyLog(logger Logger, id string, e bool, format string, v ...interface{}) {
	if len(v) > 0 {
		logger.Printf(getFmtSring(prefixProxy, e)+format, append([]interface{}{id}, v...)...)
	} else {
		logger.Printf(getFmtSring(prefixProxy, e)+format, id)
	}
}

func ProxyBridgeLog(logger Logger, id string, e bool, format string, v ...interface{}) {
	if len(v) > 0 {
		logger.Printf(getFmtSring(prefixProxyBridge, e)+format, append([]interface{}{id}, v...)...)
	} else {
		logger.Printf(getFmtSring(prefixProxyBridge, e)+format, id)
	}
}
