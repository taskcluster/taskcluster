// +build darwin linux

package fileutil

import (
	"io/ioutil"
	"os"
	"testing"
)

// TestSecureFile tests that fileutil.SecureFile creates a temporary file,
// makes it world readable, passes it to fileutil.SecureFile, and then checks
// that that no error is returned, and that the file has 0600 file permissions.
// There is no easy way in a unit test to create the file as a different user,
// and check that it is modified to be owned by the current user. However, just
// checking that we don't get an error is still better than nothing, since it
// ensures we have /usr/bin/id on the system, etc. :-)
func TestSecureFile(t *testing.T) {
	content := []byte("i am secret")
	tmpfile, err := ioutil.TempFile("", "TestSecureFile")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(tmpfile.Name()) // clean up
	if _, err := tmpfile.Write(content); err != nil {
		t.Fatal(err)
	}
	if err := tmpfile.Close(); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(tmpfile.Name(), 0777); err != nil {
		t.Fatal(err)
	}
	if err := SecureFiles(tmpfile.Name()); err != nil {
		t.Fatal(err)
	}
	stat, err := os.Stat(tmpfile.Name())
	if err != nil {
		t.Fatal(err)
	}
	if stat.Mode() != 0600 {
		t.Fatalf("Was expecting file mode 0600 but got %v", stat.Mode())
	}
}
