package main

import (
	"os"
	"path/filepath"
	"strconv"
	"testing"

	"github.com/mcuadros/go-defaults"

	"github.com/stretchr/testify/require"
	"github.com/taskcluster/taskcluster/v110/workers/generic-worker/fileutil"
	"github.com/taskcluster/taskcluster/v110/workers/generic-worker/gwconfig"
)

func TestPreloadedDirectoryCaches(t *testing.T) {
	originalConfig, originalDirectories, originalFiles := config, directoryCaches, fileCaches
	t.Cleanup(func() { config, directoryCaches, fileCaches = originalConfig, originalDirectories, originalFiles })
	root := t.TempDir()
	t.Chdir(root)
	seed := filepath.Join(root, "caches", "prepared", "seed")
	require.NoError(t, os.MkdirAll(seed, 0700))
	marker := filepath.Join(seed, "marker")
	require.NoError(t, os.WriteFile(marker, []byte("from image"), 0600))
	before, err := os.Stat(marker)
	require.NoError(t, err)
	config = &gwconfig.Config{
		CachesDir: filepath.Join(root, "caches"), DownloadsDir: filepath.Join(root, "downloads"),
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
	require.True(t, entry.Created.IsZero(), "preloaded cache age must remain unknown for purge checks")
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

func TestPreloadedCachesInTasks(t *testing.T) {
	setup(t)
	prepared := filepath.Join(config.CachesDir, t.Name())
	t.Cleanup(func() { require.NoError(t, os.RemoveAll(prepared)) })
	names := []string{"pip", "toolchain"}
	initial := []int{17, 39}
	mounts := []MountEntry{}
	payload := GenericWorkerPayload{MaxRunTime: 180}
	defaults.SetDefaults(&payload)
	for i, name := range names {
		location := filepath.Join(prepared, name)
		require.NoError(t, os.MkdirAll(location, 0700))
		require.NoError(t, os.WriteFile(filepath.Join(location, "counter"), []byte(strconv.Itoa(initial[i])), 0600))
		config.PreloadedDirectoryCaches = append(config.PreloadedDirectoryCaches,
			gwconfig.PreloadedDirectoryCache{CacheName: name, Location: location})
		mounts = append(mounts, &WritableDirectoryCache{CacheName: name, Directory: name})
		payload.Command = append(payload.Command, incrementCounterInCacheDir(name)...)
	}
	payload.Mounts = toMountArray(t, &mounts)
	for run := 1; run <= 2; run++ {
		td := testTask(t)
		td.Scopes = []string{"generic-worker:cache:pip", "generic-worker:cache:toolchain"}
		submitAndAssert(t, td, payload, "completed", "completed")
		for i, name := range names {
			entries := directoryCaches[name]
			require.Len(t, entries, 1)
			require.Equal(t, config.PreloadedDirectoryCaches[i].Location, entries[0].Location)
			contents, err := os.ReadFile(filepath.Join(entries[0].Location, "counter"))
			require.NoError(t, err)
			require.Equal(t, strconv.Itoa(initial[i]+run), string(contents), "task must use and preserve each prepared cache")
		}
	}
}
