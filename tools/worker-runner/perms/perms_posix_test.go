//go:build linux || darwin || freebsd

package perms

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/Flaque/filet"
	"github.com/stretchr/testify/require"
	"golang.org/x/sys/unix"
)

func makePermsBad(t *testing.T, filename string) {
	t.Helper()
	require.NoError(t, os.Chmod(filename, 0666))
}

// TestMakeFilePrivate_DoesNotWidenTighterModes verifies that an operator who
// has deliberately set a stricter mode than 0600 (e.g. 0400) does not have
// that mode silently widened. The file is already private as far as group
// and other are concerned, so MakeFilePrivate must no-op. It also verifies
// that ReadPrivateFile accepts such a file rather than rejecting it for not
// being exactly 0600.
func TestMakeFilePrivate_DoesNotWidenTighterModes(t *testing.T) {
	defer filet.CleanUp(t)
	dir := filet.TmpDir(t, "")

	for _, mode := range []os.FileMode{0400, 0500, 0600, 0700} {
		t.Run(mode.String(), func(t *testing.T) {
			filename := filepath.Join(dir, "tightmode-"+mode.String())
			require.NoError(t, os.WriteFile(filename, []byte("secret"), 0600))
			require.NoError(t, os.Chmod(filename, mode))

			wasLoose, err := MakeFilePrivate(filename)
			require.NoError(t, err)
			require.False(t, wasLoose, "mode %v should be treated as already private", mode)

			stat, err := os.Stat(filename)
			require.NoError(t, err)
			require.Equal(t, mode, stat.Mode().Perm(),
				"MakeFilePrivate must not modify a file that is already private")

			// A file that is private (no group/other bits) but not exactly
			// 0600 must still be readable via ReadPrivateFile; otherwise
			// operators who tighten permissions break the config load path.
			content, err := ReadPrivateFile(filename)
			require.NoError(t, err, "ReadPrivateFile should accept mode %v", mode)
			require.Equal(t, []byte("secret"), content)
		})
	}
}

// TestMakeFilePrivate_RefusesNonRegularFile verifies that MakeFilePrivate
// rejects a FIFO at the config path. Without the regular-file guard, a FIFO
// with 0600 perm bits would pass as "private" and worker-runner would then
// block trying to read from it (or consume arbitrary attacker-supplied data
// if it's a FIFO the attacker controls).
func TestMakeFilePrivate_RefusesNonRegularFile(t *testing.T) {
	defer filet.CleanUp(t)
	dir := filet.TmpDir(t, "")
	filename := filepath.Join(dir, "fifo")
	require.NoError(t, unix.Mkfifo(filename, 0600))

	// O_NOFOLLOW + O_RDONLY on a FIFO blocks unless O_NONBLOCK is also set;
	// we use O_NONBLOCK indirectly by ensuring the open doesn't hang here.
	// The guard in MakeFilePrivate should reject before any blocking occurs.
	_, err := MakeFilePrivate(filename)
	require.Error(t, err, "MakeFilePrivate must refuse a FIFO at the config path")
	require.Contains(t, err.Error(), "not a regular file")
}

// TestReadPrivateFile_RefusesOwnerUnreadable verifies that a file with no
// group/other bits but also no owner-read bit (e.g. 0200) is rejected by
// verifyPrivateToOwner via ReadPrivateFile. Accepting such a mode would
// mask a provisioning mistake or (under root, where DAC is bypassed) pass
// through and leave the broken mode in place.
//
// This test targets verifyPrivateToOwner specifically because MakeFilePrivate's
// identical check is unreachable under non-root: its O_RDONLY open fails
// with EACCES before the mode check runs on an owner-unreadable file.
func TestReadPrivateFile_RefusesOwnerUnreadable(t *testing.T) {
	defer filet.CleanUp(t)
	dir := filet.TmpDir(t, "")

	// Only modes with no group/other bits are tested here; the loose-perms
	// path is already covered elsewhere. 0200 = write only; 0300 = write +
	// execute; 0100 = execute only.
	for _, mode := range []os.FileMode{0100, 0200, 0300} {
		t.Run(mode.String(), func(t *testing.T) {
			filename := filepath.Join(dir, "unreadable-"+mode.String())
			require.NoError(t, os.WriteFile(filename, []byte("secret"), 0600))
			require.NoError(t, os.Chmod(filename, mode))

			_, err := ReadPrivateFile(filename)
			require.Error(t, err, "ReadPrivateFile must refuse mode %v", mode)
			require.Contains(t, err.Error(), "owner-read bit must be set")
		})
	}
}
