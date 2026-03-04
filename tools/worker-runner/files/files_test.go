package files

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/Flaque/filet"
	"github.com/stretchr/testify/assert"
)

func TestFile(t *testing.T) {
	defer filet.CleanUp(t)
	dir := filet.TmpDir(t, "")
	path := filepath.Join(dir, "greeting")

	file := File{
		Description: "greeting",
		Path:        path,
		Content:     "SGVsbG8sIFdvcmxk",
		Encoding:    "base64",
		Format:      "file",
	}

	err := file.extract()
	if assert.NoError(t, err) {
		bytes, err := os.ReadFile(path)
		if assert.NoError(t, err) {
			assert.Equal(t, "Hello, World", string(bytes))
		}
	}
}

func TestFileSubdir(t *testing.T) {
	defer filet.CleanUp(t)
	dir := filet.TmpDir(t, "")
	path := filepath.Join(dir, "path", "to", "greeting")

	file := File{
		Description: "greeting",
		Path:        path,
		Content:     "SGVsbG8sIFdvcmxk",
		Encoding:    "base64",
		Format:      "file",
	}

	err := file.extract()
	if assert.NoError(t, err) {
		bytes, err := os.ReadFile(path)
		if assert.NoError(t, err) {
			assert.Equal(t, "Hello, World", string(bytes))
		}
	}
}

func TestZipSubdir(t *testing.T) {
	defer filet.CleanUp(t)
	dir := filet.TmpDir(t, "")
	path := filepath.Join(dir, "path", "to", "unpack")

	file := File{
		Description: "stuff",
		Path:        path,
		// this is a ZIP file with `hi`, `dir/sub`, and `bye` in it.
		Content:  `UEsDBAoAAAAAACyz8063xRQTBAAAAAQAAAADABwAYnllVVQJAANTQzJdU0MyXXV4CwABBOkDAAAE6QMAAGJ5ZQpQSwMECgAAAAAAZrPzTu6a6r0EAAAABAAAAAcAHABkaXIvc3ViVVQJAAO/QzJdv0MyXXV4CwABBOkDAAAE6QMAAHN1YgpQSwMECgAAAAAAKrPzTnp6b+0DAAAAAwAAAAIAHABoaVVUCQADUEMyXVBDMl11eAsAAQTpAwAABOkDAABoaQpQSwECHgMKAAAAAAAss/NOt8UUEwQAAAAEAAAAAwAYAAAAAAABAAAAtIEAAAAAYnllVVQFAANTQzJddXgLAAEE6QMAAATpAwAAUEsBAh4DCgAAAAAAZrPzTu6a6r0EAAAABAAAAAcAGAAAAAAAAQAAALSBQQAAAGRpci9zdWJVVAUAA79DMl11eAsAAQTpAwAABOkDAABQSwECHgMKAAAAAAAqs/NOenpv7QMAAAADAAAAAgAYAAAAAAABAAAAtIGGAAAAaGlVVAUAA1BDMl11eAsAAQTpAwAABOkDAABQSwUGAAAAAAMAAwDeAAAAxQAAAAAA`,
		Encoding: "base64",
		Format:   "zip",
	}

	err := file.extract()
	if assert.NoError(t, err) {
		bytes, err := os.ReadFile(filepath.Join(path, "hi"))
		if assert.NoError(t, err) {
			assert.Equal(t, "hi\n", string(bytes))
		}
		bytes, err = os.ReadFile(filepath.Join(path, "bye"))
		if assert.NoError(t, err) {
			assert.Equal(t, "bye\n", string(bytes))
		}
		bytes, err = os.ReadFile(filepath.Join(path, "dir/sub"))
		if assert.NoError(t, err) {
			assert.Equal(t, "sub\n", string(bytes))
		}
	}
}
