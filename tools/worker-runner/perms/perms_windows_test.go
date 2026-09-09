//go:build windows

package perms

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/Flaque/filet"
	"github.com/stretchr/testify/require"
	"golang.org/x/sys/windows"
)

func makePermsBad(t *testing.T, filename string) {
	// allow access to anonymous.. that seems bad..
	si, err := windows.SecurityDescriptorFromString("D:PAI(A;;FA;;;OW)(A;;FA;;;AN)")
	require.NoError(t, err)

	dacl, _, err := si.DACL()
	require.NoError(t, err)

	// use all of that to set the owner, group, and dacl for the file.
	require.NoError(t, windows.SetNamedSecurityInfo(
		filename,
		windows.SE_FILE_OBJECT,
		windows.DACL_SECURITY_INFORMATION,
		nil,
		nil,
		dacl,
		nil))
}

// TestMakeFilePrivate_Windows_AlreadyPrivate covers the no-op path: a file
// created via WritePrivateFile (owner-only DACL) should be recognized as
// private and returned unchanged.
func TestMakeFilePrivate_Windows_AlreadyPrivate(t *testing.T) {
	defer filet.CleanUp(t)
	dir := filet.TmpDir(t, "")
	filename := filepath.Join(dir, "already-private")
	require.NoError(t, WritePrivateFile(filename, []byte("secret")))

	wasLoose, err := MakeFilePrivate(filename)
	require.NoError(t, err)
	require.False(t, wasLoose, "expected no fix when file is already private")

	content, err := ReadPrivateFile(filename)
	require.NoError(t, err)
	require.Equal(t, []byte("secret"), content)
}

// TestMakeFilePrivate_Windows_LoosePerms covers the tightening path: a file
// whose DACL grants access to other principals should be detected and
// rewritten to owner-only.
func TestMakeFilePrivate_Windows_LoosePerms(t *testing.T) {
	defer filet.CleanUp(t)
	dir := filet.TmpDir(t, "")
	filename := filepath.Join(dir, "loose")
	require.NoError(t, WritePrivateFile(filename, []byte("secret")))
	makePermsBad(t, filename)

	wasLoose, err := MakeFilePrivate(filename)
	require.NoError(t, err)
	require.True(t, wasLoose, "expected fix to be reported when DACL was loose")

	// file is now private again; reading via ReadPrivateFile succeeds
	content, err := ReadPrivateFile(filename)
	require.NoError(t, err)
	require.Equal(t, []byte("secret"), content)
}

// TestMakeFilePrivate_Windows_NonExistent covers the error path for a
// missing file.
func TestMakeFilePrivate_Windows_NonExistent(t *testing.T) {
	defer filet.CleanUp(t)
	dir := filet.TmpDir(t, "")
	filename := filepath.Join(dir, "does-not-exist")

	_, err := MakeFilePrivate(filename)
	require.Error(t, err)
	require.True(t, os.IsNotExist(err))
}
