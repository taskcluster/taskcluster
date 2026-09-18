package main

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/taskcluster/taskcluster/v110/workers/generic-worker/fileutil"
	"github.com/taskcluster/taskcluster/v110/workers/generic-worker/gwconfig"
)

func TestPreloadedDirectoryCaches(t *testing.T) {
	originalConfig, originalDirectories, originalFiles := config, directoryCaches, fileCaches
	t.Cleanup(func() { config, directoryCaches, fileCaches = originalConfig, originalDirectories, originalFiles })
	root := t.TempDir()
	t.Chdir(root)
	seed := filepath.Join(root, "caches", "seed")
	require.NoError(t, os.MkdirAll(seed, 0700))
	marker := filepath.Join(seed, "marker")
	require.NoError(t, os.WriteFile(marker, []byte("from image"), 0600))
	before, err := os.Stat(marker)
	require.NoError(t, err)
	config = &gwconfig.Config{
		CachesDir: filepath.Dir(seed), DownloadsDir: filepath.Join(root, "downloads"),
		PreloadedDirectoryCaches: []gwconfig.PreloadedDirectoryCache{
			{CacheName: "checkout", Location: seed},
			{CacheName: "checkout", Location: seed}, // Repeated runner configuration is harmless.
			{CacheName: "missing", Location: filepath.Join(root, "missing")},
			{CacheName: "file", Location: marker},
		},
	}
	feature := &MountsFeature{}
	require.NoError(t, feature.Initialise())
	require.Len(t, directoryCaches, 1)
	require.Len(t, directoryCaches["checkout"], 1)
	entry := directoryCaches["checkout"][0]
	require.Equal(t, seed, entry.Location)
	after, err := os.Stat(marker)
	require.NoError(t, err)
	require.True(t, os.SameFile(before, after), "registration must not copy the seed")
	// A seed inside cachesDir must survive normal garbage collection.
	sweepUnknownContent(config.CachesDir, directoryCaches)
	require.FileExists(t, marker)
	require.Same(t, entry, AcquireCache("checkout"))
	require.Nil(t, AcquireCache("checkout"))
	require.NoError(t, os.WriteFile(marker, []byte("task update"), 0600))
	ReleaseCache(entry)
	require.NoError(t, fileutil.WriteToFileAsJSON(&directoryCaches, "directory-caches.json"))

	// A loaded cache takes precedence even if configuration points elsewhere.
	other := filepath.Join(root, "other")
	require.NoError(t, os.Mkdir(other, 0700))
	config.PreloadedDirectoryCaches[0].Location = other
	require.NoError(t, feature.Initialise())
	require.Equal(t, seed, directoryCaches["checkout"][0].Location)
	contents, err := os.ReadFile(marker)
	require.NoError(t, err)
	require.Equal(t, "task update", string(contents))

	// Purging uses the existing cache owner and removes the registered directory.
	config.PreloadedDirectoryCaches[0].Location = seed
	require.NoError(t, directoryCaches["checkout"][0].Purge(nil))
	require.Empty(t, directoryCaches)
	require.NoDirExists(t, seed)
	require.NoError(t, feature.Initialise())
	require.Empty(t, directoryCaches, "a purged seed must not return on restart")
}
