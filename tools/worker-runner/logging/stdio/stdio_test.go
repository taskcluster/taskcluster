package stdio

import (
	"bytes"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/taskcluster/taskcluster/v50/tools/worker-runner/logging/logging"
)

func makeLogger() (logging.Logger, *bytes.Buffer) {
	stdioLogDestination := New(nil).(*stdioLogDestination)

	// modify the logger in-place to get behavior we can test for
	buf := bytes.NewBuffer([]byte{})
	stdioLogDestination.log.SetOutput(buf)
	stdioLogDestination.log.SetFlags(0)

	return stdioLogDestination, buf
}

func TestLogUnstructured(t *testing.T) {
	dst, buf := makeLogger()

	dst.LogUnstructured("uhoh!")
	require.Equal(t, []byte("uhoh!\n"), buf.Bytes())
}

func TestLogStructured(t *testing.T) {
	dst, buf := makeLogger()

	dst.LogStructured(map[string]interface{}{"level": "bad"})
	require.Equal(t, []byte("level: bad\n"), buf.Bytes())
}
