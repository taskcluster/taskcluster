package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"slices"

	"github.com/mholt/archives"
	"github.com/taskcluster/httpbackoff/v3"
	"github.com/taskcluster/slugid-go/slugid"
	tcclient "github.com/taskcluster/taskcluster/v102/clients/client-go"
	"github.com/taskcluster/taskcluster/v102/internal/mocktc/tc"
	"github.com/taskcluster/taskcluster/v102/internal/scopes"
	"github.com/taskcluster/taskcluster/v102/workers/generic-worker/fileutil"
	"golang.org/x/sync/singleflight"
)

var (
	// downloaded files that may be archives or individual files are stored in
	// fileCache, against a unique key that identifies where they were
	// downloaded from. The map values are the paths of the downloaded files
	// relative to the downloads directory specified in the global config file
	// on the worker.
	fileCaches FileCacheMap
	// writable directory caches that may be preloaded or initially empty. Note
	// a preloaded cache will have an associated file cache for the archive it
	// was created from. The key is the cache name.
	directoryCaches CacheMap
	// we track this in order to reduce number of results we get back from
	// purge cache service
	lastQueriedPurgeCacheService time.Time
	// cacheMutex protects access to fileCaches, directoryCaches, and
	// lastQueriedPurgeCacheService for concurrent task execution (capacity > 1)
	cacheMutex sync.Mutex

	// fileCacheDownloads deduplicates concurrent downloads for the same cache key.
	fileCacheDownloads singleflight.Group
)

type (
	CacheMap     map[string][]*Cache
	FileCacheMap map[string]*Cache
)

// CacheOwner allows a Cache to remove itself from its owning map during eviction.
type CacheOwner interface {
	Remove(entry *Cache)
}

func (cm CacheMap) SortedResources() Resources {
	r := Resources{}
	for _, entries := range cm {
		for _, cache := range entries {
			if !cache.InUse {
				r = append(r, cache)
			}
		}
	}
	sort.Sort(r)
	return r
}

func (cm CacheMap) Remove(entry *Cache) {
	entries := cm[entry.Key]
	for i, e := range entries {
		if e == entry {
			cm[entry.Key] = append(entries[:i], entries[i+1:]...)
			break
		}
	}
	if len(cm[entry.Key]) == 0 {
		delete(cm, entry.Key)
	}
}

// AcquireCache finds an available (not in-use, not awaiting purge) pool
// entry for the given cache name, marks it InUse, and returns it.
// Returns nil if no entry is available.
//
// NeedsPurge entries are skipped because their on-disk content is in
// the process of being deleted (or is partially deleted after a failed
// purgeCaches RemoveAll). Handing one out would either run a task
// against half-empty cache content or fail with a RenameCrossDevice
// error when Mount tries to move it into place.
//
// Caller must hold cacheMutex.
func AcquireCache(name string) *Cache {
	entries := directoryCaches[name]
	var best *Cache
	for _, e := range entries {
		if e.InUse || e.NeedsPurge {
			continue
		}
		if best == nil || e.LastUsed.After(best.LastUsed) {
			best = e
		}
	}
	if best != nil {
		best.InUse = true
		best.Hits++
	}
	return best
}

// ReleaseCache marks a pool entry as available and records the current time.
// If a purge was requested while the entry was in use, the entry is evicted
// instead of being returned to the pool.
// Caller must hold cacheMutex.
func ReleaseCache(entry *Cache) {
	if entry.NeedsPurge {
		log.Printf("Evicting cache %v that was marked for purge while in use", entry.Key)
		_ = entry.Evict(nil)
		return
	}
	entry.InUse = false
	entry.LastUsed = time.Now()
}

// newPoolEntry creates a new in-use cache pool entry for the given cache name.
// Caller must hold cacheMutex.
func newPoolEntry(cacheName string) (*Cache, error) {
	basename := slugid.Nice()
	file := filepath.Join(config.CachesDir, basename)
	return &Cache{
		Hits:     1,
		Created:  time.Now(),
		Location: file,
		Owner:    directoryCaches,
		Key:      cacheName,
		InUse:    true,
	}, nil
}

// trimPoolExcess evicts available entries beyond config.Capacity per cache name.
// Caller must hold cacheMutex.
func trimPoolExcess() {
	for name, entries := range directoryCaches {
		available := []*Cache{}
		for _, e := range entries {
			if !e.InUse {
				available = append(available, e)
			}
		}
		excess := len(available) - int(config.Capacity)
		if excess <= 0 {
			continue
		}
		sort.Slice(available, func(i, j int) bool {
			return available[i].LastUsed.Before(available[j].LastUsed)
		})
		for i := range excess {
			_ = available[i].Evict(nil)
		}
		if len(directoryCaches[name]) == 0 {
			delete(directoryCaches, name)
		}
	}
}

func (cm FileCacheMap) SortedResources() Resources {
	r := make(Resources, len(cm))
	i := 0
	for _, cache := range cm {
		r[i] = cache
		i++
	}
	sort.Sort(r)
	return r
}

func (cm FileCacheMap) Remove(entry *Cache) {
	delete(cm, entry.Key)
}

func (cm *FileCacheMap) LoadFromFile(stateFile string, cacheDir string) {
	_, err := os.Stat(stateFile)
	if err != nil {
		log.Printf("No %v file found, creating empty FileCacheMap", stateFile)
		*cm = FileCacheMap{}
		perms := os.FileMode(0700)
		log.Printf("[mounts] Creating worker cache directory %v with permissions 0%o", cacheDir, perms)
		err := os.MkdirAll(cacheDir, perms)
		if err != nil {
			panic(fmt.Errorf("[mounts] Not able to create worker cache directory %v with permissions 0%o: %v", cacheDir, perms, err))
		}
		return
	}
	err = loadFromJSONFile(cm, stateFile)
	if err != nil {
		panic(err)
	}
	for i := range *cm {
		if _, err = os.Stat((*cm)[i].Location); err != nil {
			log.Printf("WARNING: Cache %#v missing on worker - corrupt internal state, ignoring!", (*cm)[i])
			delete(*cm, i)
		} else {
			(*cm)[i].Owner = *cm
		}
	}
}

type Cache struct {
	Created time.Time `json:"created"`
	// the full path to the cache on disk (could be file or directory)
	Location string `json:"location"`
	// the number of times this cache has been included in a MountEntry on a
	// task run on this worker
	Hits int `json:"hits"`
	// The map that tracks the cache, needed for expunging the cache
	// Don't store in json, otherwise we'll have circular structure and create
	// an infinite file!
	Owner CacheOwner `json:"-"`
	// The key used in the CacheMap
	Key string `json:"key"`
	// SHA256 of content, if a file (not used for directories)
	SHA256 string `json:"sha256"`
	// InUse indicates whether a task currently owns this pool entry.
	// Persisted with json:"in_use" (rather than json:"-") because
	// loadFromJSONFile uses DisallowUnknownFields — older state files
	// written by prior workers contain "in_use" and would otherwise
	// fail the new-format unmarshal. LoadFromFile resets to false
	// on startup since no task can be running across a worker restart.
	InUse bool `json:"in_use"`
	// LastUsed records when this entry was last returned to the pool.
	LastUsed time.Time `json:"last_used"`
	// NeedsPurge is set when a purge request arrives while the entry is
	// in use. ReleaseCache checks this flag and evicts the entry instead
	// of returning it to the pool.
	NeedsPurge bool `json:"-"`
}

// Rating determines how valuable the cache is compared to others.
// Older entries get lower ratings and are evicted first by GC.
func (cache *Cache) Rating() float64 {
	if cache.LastUsed.IsZero() {
		return 0
	}
	return float64(cache.LastUsed.Unix())
}

func (cache *Cache) Evict(taskMount *TaskMount) error {
	if taskMount != nil {
		taskMount.Infof("Removing cache %v from cache table", cache.Key)
	}
	if cache.Owner != nil {
		cache.Owner.Remove(cache)
	}
	if taskMount != nil {
		taskMount.Infof("Deleting cache %v file(s) at %v", cache.Key, cache.Location)
	}
	// delete the cache on the file system
	return os.RemoveAll(cache.Location)
}

// Represents the Mounts feature as a whole - one global instance
type MountsFeature struct {
}

func (feature *MountsFeature) Name() string {
	return "Mounts/Caches"
}

func (taskMount *TaskMount) ReservedArtifacts() []string {
	return []string{}
}

func (taskMount *TaskMount) Infof(format string, v ...any) {
	taskMount.task.Infof("[mounts] "+format, v...)
}

func (taskMount *TaskMount) Warnf(format string, v ...any) {
	taskMount.task.Warnf("[mounts] "+format, v...)
}

func (taskMount *TaskMount) Errorf(format string, v ...any) {
	taskMount.task.Errorf("[mounts] "+format, v...)
}

func (taskMount *TaskMount) Info(message string) {
	taskMount.task.Info("[mounts] " + message)
}

func (taskMount *TaskMount) Warn(message string) {
	taskMount.task.Warn("[mounts] " + message)
}

func (taskMount *TaskMount) Error(message string) {
	taskMount.task.Error("[mounts] " + message)
}

func MkdirAll(taskMount *TaskMount, dir string) error {
	taskMount.Infof("Creating directory %v", dir)
	return MkdirAllTaskUser(dir, taskMount.task.GetContext(), taskMount.task.pd)
}

func (cm *CacheMap) LoadFromFile(stateFile string, cacheDir string) {
	_, err := os.Stat(stateFile)
	if err != nil {
		log.Printf("No %v file found, creating empty CacheMap", stateFile)
		*cm = CacheMap{}
		perms := os.FileMode(0700)
		log.Printf("[mounts] Creating worker cache directory %v with permissions 0%o", cacheDir, perms)
		err := os.MkdirAll(cacheDir, perms)
		if err != nil {
			panic(fmt.Errorf("[mounts] Not able to create worker cache directory %v with permissions 0%o: %v", cacheDir, perms, err))
		}
		return
	}

	// Try new pool format (map[string][]*Cache) first
	err = loadFromJSONFile(cm, stateFile)
	if err != nil {
		// Try old format (map[string]*Cache) for migration from pre-pool versions
		var old map[string]*Cache
		if oldErr := loadFromJSONFile(&old, stateFile); oldErr != nil {
			panic(oldErr)
		}
		*cm = CacheMap{}
		for k, v := range old {
			(*cm)[k] = []*Cache{v}
		}
	}

	// Validate entries, remove missing directories, set Owner, reset InUse
	for name, entries := range *cm {
		valid := entries[:0]
		for _, cache := range entries {
			if _, statErr := os.Stat(cache.Location); statErr != nil {
				log.Printf("WARNING: Cache %#v missing on worker - corrupt internal state, ignoring!", cache)
				continue
			}
			cache.Owner = *cm
			cache.InUse = false // all entries are available on startup
			valid = append(valid, cache)
		}
		if len(valid) == 0 {
			delete(*cm, name)
		} else {
			(*cm)[name] = valid
		}
	}
}

func (feature *MountsFeature) Initialise() error {
	cacheMutex.Lock()
	defer cacheMutex.Unlock()
	fileCaches.LoadFromFile("file-caches.json", config.CachesDir)
	directoryCaches.LoadFromFile("directory-caches.json", config.DownloadsDir)
	return nil
}

// Represents the Mounts feature for an individual task (one per task)
type TaskMount struct {
	task    *TaskRun
	mounts  []MountEntry
	mounted []MountEntry
	// payload errors are detected when creating feature but only reported when
	// feature starts, so need to keep hold of any error raised...
	payloadError      error
	requiredScopes    scopes.Required
	referencedTaskIDs map[string]bool // simple implementation of set of strings
	index             tc.Index
	// poolEntries tracks which pool entry each WritableDirectoryCache acquired
	// during Mount, so Unmount can release it back.
	poolEntries map[*WritableDirectoryCache]*Cache
}

// Represents an individual Mount listed in task payload - there
// can be several mounts per task
type MountEntry interface {
	Mount(taskMount *TaskMount) error
	Unmount(taskMount *TaskMount) error
	FSContent() (FSContent, error)
	RequiredScopes() []string
}

// FSContent represents file system content - it is based on the auto-generated
// type Content which is json.RawMessage, which can be ArtifactContent,
// IndexedContent, URLContent, RawContent or Base64Content concrete types. This
// is the interface which represents these underlying concrete types.
type FSContent interface {
	// Keep it simple and just return a []string, rather than scopes.Required
	// since currently no easy way to "AND" scopes.Required types.
	RequiredScopes() []string
	// Download the content, and return the absolute location of the file. No
	// archive extraction is performed.
	Download(taskMount *TaskMount) (file string, sha256 string, err error)
	// UniqueKey returns a string which represents the content, such that if
	// two FSContent types return the same key, it can be assumed they
	// represent the same content.
	UniqueKey(taskMount *TaskMount) (string, error)
	// SHA256 of the content.
	RequiredSHA256() string
	// String representation of where the content comes from
	String() string
	TaskDependencies() []string
}

// No scopes required to mount files/dirs in a task
func (uc *URLContent) RequiredScopes() []string {
	return []string{}
}

// The Queue enforces required scopes for artifacts, so we do
// not need to consider anything
func (ac *ArtifactContent) RequiredScopes() []string {
	return []string{}
}

// The Index enforces required scopes for artifacts, so we do
// not need to consider anything
func (ac *IndexedContent) RequiredScopes() []string {
	return []string{}
}

// No scopes required to mount files in a task
func (rc *RawContent) RequiredScopes() []string {
	return []string{}
}

func (bc *Base64Content) RequiredScopes() []string {
	return []string{}
}

func (feature *MountsFeature) IsEnabled() bool {
	return config.EnableMounts
}

// Since mounts are protected by scopes per mount, no reason to have
// a feature flag to enable. Having mounts in the payload is enough.
func (feature *MountsFeature) IsRequested(task *TaskRun) bool {
	return true
}

// NewTaskFeature reads payload and initialises state...
func (feature *MountsFeature) NewTaskFeature(task *TaskRun) TaskFeature {
	tm := &TaskMount{
		task:        task,
		mounts:      []MountEntry{},
		mounted:     []MountEntry{},
		poolEntries: make(map[*WritableDirectoryCache]*Cache),
	}
	for i, taskMount := range task.Payload.Mounts {
		// Each mount must be one of:
		//   * WritableDirectoryCache
		//   * ReadOnlyDirectory
		//   * FileMount
		// We have to check keys to find out...
		var m map[string]any
		if err := json.Unmarshal(taskMount, &m); err != nil {
			tm.payloadError = fmt.Errorf("could not read task mount %v: %v\n%v", i, string(taskMount), err)
			return tm
		}
		switch {
		case m["cacheName"] != nil:
			tm.Unmarshal(taskMount, &WritableDirectoryCache{})
		case m["directory"] != nil:
			tm.Unmarshal(taskMount, &ReadOnlyDirectory{})
		case m["file"] != nil:
			tm.Unmarshal(taskMount, &FileMount{})
		default:
			tm.payloadError = fmt.Errorf("unrecognised mount entry in payload - %#v", m)
		}
	}
	tm.initRequiredScopes()
	tm.initReferencedTaskIDs()
	tm.initIndexClient()

	return tm
}

// Utility method to unmarshal a json blob and add it to the mounts in the TaskMount
func (taskMount *TaskMount) Unmarshal(rm json.RawMessage, m MountEntry) {
	// only update if nil, otherwise we could replace a previous error with nil
	if taskMount.payloadError == nil {
		taskMount.payloadError = json.Unmarshal(rm, m)
		taskMount.mounts = append(taskMount.mounts, m)
	}
}

// Note, we've calculated the required scopes in NewTaskFeature(...) already -
// we do this in advance in case there is an error, we can report it upfront
// when we initialise, rather than later when we go to check what scopes are
// needed.
func (taskMount *TaskMount) RequiredScopes() scopes.Required {
	return taskMount.requiredScopes
}

// loops through all referenced mounts and checks what scopes are required to
// mount them
func (taskMount *TaskMount) initRequiredScopes() {
	requiredScopes := []string{}
	for _, mount := range taskMount.mounts {
		requiredScopes = append(requiredScopes, mount.RequiredScopes()...)
		fsContent, err := mount.FSContent()
		if err != nil {
			taskMount.payloadError = err
			return
		}
		// A writable cache might not be preloaded so might have no initial content
		if fsContent != nil {
			requiredScopes = append(requiredScopes, fsContent.RequiredScopes()...)
		}
	}
	taskMount.requiredScopes = scopes.Required{requiredScopes}
}

// loops through all referenced mounts and keeps a list of referenced TaskIDs
func (taskMount *TaskMount) initReferencedTaskIDs() {
	taskMount.referencedTaskIDs = map[string]bool{}
	for _, mount := range taskMount.mounts {
		fsContent, err := mount.FSContent()
		if err != nil {
			taskMount.payloadError = err
			return
		}
		// A writable cache might not be preloaded so might have no initial content
		if fsContent != nil {
			for _, taskID := range fsContent.TaskDependencies() {
				taskMount.referencedTaskIDs[taskID] = true
			}
		}
	}
	taskDependencies := map[string]bool{}
	for _, taskID := range taskMount.task.Definition.Dependencies {
		taskDependencies[taskID] = true
	}
	for taskID := range taskMount.referencedTaskIDs {
		if !taskDependencies[taskID] {
			taskMount.payloadError = fmt.Errorf("[mounts] task.dependencies needs to include %v since one or more of its artifacts are mounted", taskID)
			return
		}
	}
}

func (taskMount *TaskMount) initIndexClient() {
	// technically, we could also call task.StatusManager.RegisterListener(...)
	// to update credentials here when the task is reclaimed, but that is a lot
	// of overhead, and only needed if the feature initialisation is still
	// running when the credentials from the initial task claim expire
	taskMount.index = serviceFactory.Index(
		&tcclient.Credentials{
			AccessToken: taskMount.task.TaskClaimResponse.Credentials.AccessToken,
			ClientID:    taskMount.task.TaskClaimResponse.Credentials.ClientID,
			Certificate: taskMount.task.TaskClaimResponse.Credentials.Certificate,
		},
		config.RootURL,
	)
}

// Here the order is important. We want to delete file caches before we delete
// writable directory caches, since writable directory caches are typically the
// result of a compilation, which is slow, whereas downloading files is
// relatively quick in comparison.
func garbageCollection(tasksRunning bool) error {
	// Collect eviction candidates under the lock, then release it before
	// running potentially slow docker commands (#7).
	cacheMutex.Lock()
	fileResources := fileCaches.SortedResources()
	cacheMutex.Unlock()

	err := runGarbageCollection(fileResources, tasksRunning)
	if err != nil {
		return err
	}

	cacheMutex.Lock()
	defer cacheMutex.Unlock()

	currentFreeSpace, err := freeDiskSpaceBytes(config.TasksDir)
	if err != nil {
		return fmt.Errorf("could not calculate free disk space in dir %v due to error %#v", config.TasksDir, err)
	}
	if currentFreeSpace >= requiredSpaceBytes() {
		trimPoolExcess()
		return nil
	}

	// SortedResources only returns available (not in-use) entries
	dirResources := directoryCaches.SortedResources()
	for _, res := range dirResources {
		cache := res.(*Cache)
		evictErr := cache.Evict(nil)
		if evictErr != nil {
			return evictErr
		}

		currentFreeSpace, err = freeDiskSpaceBytes(config.TasksDir)
		if err != nil {
			return fmt.Errorf("could not calculate free disk space in dir %v due to error %#v", config.TasksDir, err)
		}
		if currentFreeSpace >= requiredSpaceBytes() {
			return nil
		}
	}

	if currentFreeSpace < requiredSpaceBytes() {
		return fmt.Errorf("not able to free up enough disk space - require %v bytes, but only have %v bytes - and nothing left to delete", requiredSpaceBytes(), currentFreeSpace)
	}
	return nil
}

// called when a task starts
func (taskMount *TaskMount) Start() *CommandExecutionError {
	if taskMount.payloadError != nil {
		return MalformedPayloadError(taskMount.payloadError)
	}
	// Check if any caches need to be purged. See:
	//   https://docs.taskcluster.net/docs/reference/core/purge-cache
	err := taskMount.purgeCaches()
	// Two possible strategies if we can't reach purgecache service:
	//
	//   1) be optimistic, assume caches are ok, and don't purge them
	//   2) be pessemistic, and delete existing caches
	//
	// Let's go with 1) for now, as 2) could cause tree closures if purgecache
	// services has an outage. Although 1) could not be part of an obscure
	// attack strategy (although releases shouldn't use caches).
	if err != nil {
		taskMount.Warn("Could not reach purgecache service to see if caches need purging:")
		taskMount.Warn(err.Error())
	}
	// loop through all mounts described in payload
	for _, mount := range taskMount.mounts {
		err = mount.Mount(taskMount)
		// An error is returned if it is a task problem, such as an invalid url
		// to download content, or a downloaded archive cannot be extracted.
		// If the problem is internal (e.g. can't mount a writable cache) then
		// this is handled by a panic.
		if err != nil {
			return Failure(fmt.Errorf("[mounts] %s", err))
		}
		taskMount.mounted = append(taskMount.mounted, mount)
	}
	return nil
}

// called when a task has completed
func (taskMount *TaskMount) Stop(err *ExecutionErrors) {
	purgeCaches := taskMount.shouldPurgeCaches()
	// loop through all mounts described in payload
	for i, mount := range taskMount.mounted {
		if purgeCaches {
			switch cache := mount.(type) {
			case *WritableDirectoryCache:
				if entry, ok := taskMount.poolEntries[cache]; ok {
					cacheMutex.Lock()
					err.add(Failure(entry.Evict(taskMount)))
					cacheMutex.Unlock()
				}
				continue
			}
		}
		e := mount.Unmount(taskMount)
		if e != nil {
			fsc, errfsc := mount.FSContent()
			if errfsc != nil {
				taskMount.Errorf("Could not unmount mount entry %v (description not available due to '%v') due to: '%v'", i, errfsc, e)
			} else {
				taskMount.Errorf("Could not unmount %v due to: '%v'", fsc, e)
			}
			err.add(Failure(e))
		}
	}
	// Persist cache state to disk with mutex protection for concurrent tasks
	cacheMutex.Lock()
	err.add(executionError(internalError, errored, fileutil.WriteToFileAsJSON(&fileCaches, "file-caches.json")))
	err.add(executionError(internalError, errored, fileutil.WriteToFileAsJSON(&directoryCaches, "directory-caches.json")))
	err.add(executionError(internalError, errored, fileutil.SecureFiles("file-caches.json", "directory-caches.json")))
	cacheMutex.Unlock()
}

func (taskMount *TaskMount) shouldPurgeCaches() bool {
	// task commands may not have run if the task
	// feature resolved as malformed-payload
	if taskMount.task.result == nil {
		return false
	}

	if slices.Contains(taskMount.task.Payload.OnExitStatus.PurgeCaches, int64(taskMount.task.result.ExitCode)) {
		taskMount.Infof("Purging caches since last command had exit code %v which is listed in task.Payload.OnExitStatus.PurgeCaches array", taskMount.task.result.ExitCode)
		return true
	}

	return false
}

// Writable caches require scope generic-worker:cache:<cacheName>. Preloaded
// caches from an artifact may also require scopes - handled separately.
func (w *WritableDirectoryCache) RequiredScopes() []string {
	return []string{"generic-worker:cache:" + w.CacheName}
}

// FSContent returns either a *ArtifactContent, *IndexedContent, *URLContent,
// *RawContent or *Base64Content that is listed in the given
// *WritableDirectoryCache
func (w *WritableDirectoryCache) FSContent() (FSContent, error) {
	// no content if an empty cache folder, e.g. object directory
	if w.Content != nil {
		return FSContentFrom(w.Content)
	}
	return nil, nil
}

// No scopes directly required for a ReadOnlyDirectory (scopes may be required
// for its content though - handled separately)
func (r *ReadOnlyDirectory) RequiredScopes() []string {
	return []string{}
}

// FSContent returns either a *ArtifactContent, *IndexedContent, *URLContent,
// *RawContent or *Base64Content that is listed in the given *ReadOnlyDirectory
func (r *ReadOnlyDirectory) FSContent() (FSContent, error) {
	return FSContentFrom(r.Content)
}

// No scopes directly required for a FileMount (scopes may be required for its
// content though - handled separately)
func (f *FileMount) RequiredScopes() []string {
	return []string{}
}

// FSContent returns either a *ArtifactContent, *IndexedContent, *URLContent,
// *RawContent or *Base64Content that is listed in the given *FileMount
func (f *FileMount) FSContent() (FSContent, error) {
	return FSContentFrom(f.Content)
}

func (w *WritableDirectoryCache) Mount(taskMount *TaskMount) (err error) {
	target := fileutil.AbsFrom(taskMount.task.TaskDir(), w.Directory)

	// Track cacheMutex through every site in this function so the
	// recover handler below can tell whether we still hold the lock
	// at panic time. Re-acquiring an already-held mutex from the same
	// goroutine deadlocks; this is the safety net the reviewer
	// flagged as fragile in the original recover-and-relock code.
	mutexHeld := false
	lock := func() {
		cacheMutex.Lock()
		mutexHeld = true
	}
	unlock := func() {
		cacheMutex.Unlock()
		mutexHeld = false
	}

	lock()
	entry := AcquireCache(w.CacheName)

	// If Mount panics after the pool entry is registered (e.g. a SHA
	// panic in a content extract), the entry would otherwise stay
	// InUse=true forever and trimPoolExcess can't reclaim it — burning
	// one slot from this cache's pool until worker restart. Recover
	// here only to release the entry; we re-panic so the worker's
	// existing crash handling still triggers an internal-error.
	released := false
	defer func() {
		if r := recover(); r != nil {
			if entry != nil && !released {
				// If we already hold the lock (panic happened
				// inside one of the brief locked windows), skip
				// the re-Lock. We still always Unlock at the end
				// — that releases either the lock we just took
				// or the one that was held when the panic fired.
				// Asymmetric Lock/Unlock would leak the mutex
				// and deadlock subsequent goroutines, which was
				// the reviewer's concern with my prior fix.
				if !mutexHeld {
					cacheMutex.Lock()
				}
				_ = entry.Evict(taskMount)
				cacheMutex.Unlock()
				delete(taskMount.poolEntries, w)
			}
			panic(r)
		}
	}()

	if entry != nil {
		cacheLocation := entry.Location
		unlock()

		parentDir := filepath.Dir(target)
		taskMount.Infof("Moving existing writable directory cache %v from %v to %v", w.CacheName, cacheLocation, target)
		if mkErr := MkdirAll(taskMount, parentDir); mkErr != nil {
			// MkdirAll failed — release the acquired entry back to the pool
			lock()
			ReleaseCache(entry)
			unlock()
			released = true
			return fmt.Errorf("not able to create directory %v: %v", parentDir, mkErr)
		}
		if mvErr := RenameCrossDevice(cacheLocation, target); mvErr != nil {
			// Rename failed — evict the broken entry from the pool
			lock()
			evictErr := entry.Evict(taskMount)
			unlock()
			released = true
			if evictErr != nil {
				panic(evictErr)
			}
			return fmt.Errorf("not able to move directory %v to %v: %v", cacheLocation, target, mvErr)
		}
		taskMount.poolEntries[w] = entry
	} else {
		// No available pool entry — create a new one
		var poolErr error
		entry, poolErr = newPoolEntry(w.CacheName)
		if poolErr != nil {
			unlock()
			return poolErr
		}
		taskMount.Infof("No existing writable directory cache '%v' - creating %v", w.CacheName, entry.Location)
		directoryCaches[w.CacheName] = append(directoryCaches[w.CacheName], entry)
		unlock()

		if w.Content != nil {
			c, fsErr := FSContentFrom(w.Content)
			if fsErr != nil {
				lock()
				_ = entry.Evict(taskMount)
				unlock()
				released = true
				return fmt.Errorf("not able to retrieve FSContent: %v", fsErr)
			}
			if extractErr := extract(c, w.Format, target, taskMount); extractErr != nil {
				lock()
				_ = entry.Evict(taskMount)
				unlock()
				released = true
				return extractErr
			}
		} else {
			if mkErr := MkdirAll(taskMount, target); mkErr != nil {
				lock()
				_ = entry.Evict(taskMount)
				unlock()
				released = true
				return fmt.Errorf("not able to create directory %v: %v", target, mkErr)
			}
		}
		taskMount.poolEntries[w] = entry
	}

	// Regardless of whether we are running as current user, grant task
	// user access. The mounted folder may be inside the task directory
	// or at an absolute path outside it. Either way, the file system
	// resources should be owned by the task user, even if commands
	// execute as LocalSystem.
	if chownErr := makeDirReadWritableForTaskUser(taskMount, target); chownErr != nil {
		lock()
		_ = entry.Evict(taskMount)
		unlock()
		delete(taskMount.poolEntries, w)
		released = true
		return chownErr
	}
	taskMount.Infof("Successfully mounted writable directory cache '%v'", target)
	return nil
}

func (w *WritableDirectoryCache) Unmount(taskMount *TaskMount) error {
	taskCacheDir := fileutil.AbsFrom(taskMount.task.TaskDir(), w.Directory)
	entry, ok := taskMount.poolEntries[w]
	if !ok {
		return Failure(fmt.Errorf("could not persist cache %q due to missing pool entry", w.CacheName))
	}

	cacheDir := entry.Location
	taskMount.Infof("Preserving cache: Moving %q to %q", taskCacheDir, cacheDir)

	// Clean up any stale directory at entry.Location. Normally this path
	// should not exist (it was renamed away during Mount), but if
	// RenameCrossDevice fell back to copy+delete on a cross-device mount,
	// an incomplete cleanup could leave remnants.
	if err := os.RemoveAll(cacheDir); err != nil {
		taskMount.Warnf("Could not remove stale cache dir %q: %v", cacheDir, err)
	}

	if err := RenameCrossDevice(taskCacheDir, cacheDir); err != nil {
		// Rename failed — evict the entry
		cacheMutex.Lock()
		evictErr := entry.Evict(taskMount)
		cacheMutex.Unlock()
		if evictErr != nil {
			panic(evictErr)
		}
		return Failure(fmt.Errorf("could not persist cache %q due to %v", w.CacheName, err))
	}

	cacheMutex.Lock()
	ReleaseCache(entry)
	cacheMutex.Unlock()
	return nil
}

func (r *ReadOnlyDirectory) Mount(taskMount *TaskMount) error {
	c, err := FSContentFrom(r.Content)
	if err != nil {
		return fmt.Errorf("not able to retrieve FSContent: %v", err)
	}
	dir := fileutil.AbsFrom(taskMount.task.TaskDir(), r.Directory)
	err = extract(c, r.Format, dir, taskMount)
	if err != nil {
		return err
	}
	return makeDirReadWritableForTaskUser(taskMount, dir)
}

// Nothing to do - original archive file wasn't moved
func (r *ReadOnlyDirectory) Unmount(taskMount *TaskMount) error {
	return nil
}

func (f *FileMount) Mount(taskMount *TaskMount) error {
	fsContent, err := FSContentFrom(f.Content)
	if err != nil {
		return err
	}

	file := fileutil.AbsFrom(taskMount.task.TaskDir(), f.File)
	if info, err := os.Stat(file); err == nil && info.IsDir() {
		return fmt.Errorf("cannot mount file at path %v since it already exists as a directory", file)
	}

	// If a file mount handler is registered for this filename, ensure the
	// content is cached and pass the cache info to the handler instead of
	// copying the file to the task directory.
	if handler, ok := taskMount.task.FileMountHandlers[f.File]; ok {
		cachedFile, sha256, err := ensureCached(fsContent, taskMount)
		if err != nil {
			return err
		}
		taskMount.Infof("File mount %q handled by registered handler (cache: %v, SHA256: %v)", f.File, cachedFile, sha256)
		return handler(cachedFile, sha256)
	}

	err = decompress(fsContent, f.Format, file, taskMount)
	if err != nil {
		return err
	}

	return makeFileReadWritableForTaskUser(taskMount, file)
}

// Nothing to do - original archive file was copied, not moved
func (f *FileMount) Unmount(taskMount *TaskMount) error {
	return nil
}

// ensureCached returns a file containing the given content
func ensureCached(fsContent FSContent, taskMount *TaskMount) (file string, sha256 string, err error) {
	cacheKey, err := fsContent.UniqueKey(taskMount)
	if err != nil {
		return "", "", err
	}
	requiredSHA256 := fsContent.RequiredSHA256()
	cacheMutex.Lock()
	cachedEntry, inCache := fileCaches[cacheKey]
	if inCache {
		file = cachedEntry.Location
		// Sanity check - if file is in file map, but not on file system,
		// something is seriously wrong, so should be a worker exception
		// (panic), not a task failure
		_, err = os.Stat(file)
		if err != nil {
			cacheMutex.Unlock()
			panic(fmt.Errorf("file in cache, but not on filesystem: %v", *cachedEntry))
		}
		cachedEntry.Hits++
		cacheMutex.Unlock()

		// validate SHA256 in case of either tampering or new content at url...
		// CalculateSHA256 happens without cacheMutex held to keep
		// concurrent SHA reads parallelisable, but that opens a race
		// where another task can evict this entry mid-read (a SHA
		// mismatch path further down does exactly that). If the file
		// vanishes under us, retry ensureCached so we re-download
		// rather than blaming a worker bug.
		sha256, err = fileutil.CalculateSHA256(file)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				taskMount.Infof("Cache entry for %v vanished mid-read (likely concurrent eviction); retrying download", cacheKey)
				return ensureCached(fsContent, taskMount)
			}
			panic(fmt.Sprintf("Internal worker bug! Cannot calculate SHA256 of file %v that I have in my cache: %v", file, err))
		}
		if requiredSHA256 == "" {
			taskMount.Warnf("No SHA256 specified in task mounts for %v - SHA256 from downloaded file %v is %v.", cacheKey, file, sha256)
			return
		}
		if requiredSHA256 == sha256 {
			taskMount.Infof("Found existing download for %v (%v) with correct SHA256 %v", cacheKey, file, sha256)
			return
		}
		taskMount.Infof("Found existing download of %v (%v) with SHA256 %v but task definition explicitly requires %v so deleting it", cacheKey, file, sha256, requiredSHA256)
		cacheMutex.Lock()
		if entry, ok := fileCaches[cacheKey]; ok {
			err = entry.Evict(taskMount)
			cacheMutex.Unlock()
			if err != nil {
				panic(fmt.Errorf("could not delete cache entry %v: %v", entry, err))
			}
		} else {
			cacheMutex.Unlock()
		}
	} else {
		cacheMutex.Unlock()
	}

	type downloadResult struct {
		file   string
		sha256 string
	}
	val, dlErr, _ := fileCacheDownloads.Do(cacheKey, func() (any, error) {
		// Re-check cache: another goroutine may have completed the download
		// while we were waiting for the singleflight lock.
		cacheMutex.Lock()
		if entry, ok := fileCaches[cacheKey]; ok {
			cacheMutex.Unlock()
			return downloadResult{file: entry.Location, sha256: entry.SHA256}, nil
		}
		cacheMutex.Unlock()

		f, s, err := fsContent.Download(taskMount)
		if err != nil {
			return nil, err
		}
		cacheMutex.Lock()
		fileCaches[cacheKey] = &Cache{
			Location: f,
			Hits:     1,
			Created:  time.Now(),
			Owner:    fileCaches,
			Key:      cacheKey,
			SHA256:   s,
		}
		cacheMutex.Unlock()
		return downloadResult{file: f, sha256: s}, nil
	})
	if dlErr != nil {
		err = dlErr
		taskMount.Errorf("Could not fetch from %v into file %v due to %v", fsContent, file, err)
		return
	}
	dl := val.(downloadResult)
	file = dl.file
	sha256 = dl.sha256
	if requiredSHA256 == "" {
		taskMount.Warnf("Download %v of %v has SHA256 %v but task payload does not declare a required value, so content authenticity cannot be verified", file, fsContent, sha256)
		return
	}
	if requiredSHA256 != sha256 {
		err = fmt.Errorf("Download %v of %v has SHA256 %v but task definition explicitly requires %v; not retrying download as there were no connection failures and HTTP response status code was 200", file, fsContent, sha256, requiredSHA256)
		cacheMutex.Lock()
		if entry, ok := fileCaches[cacheKey]; ok {
			err2 := entry.Evict(taskMount)
			cacheMutex.Unlock()
			if err2 != nil {
				panic(fmt.Errorf("could not delete cache entry %v: %v", entry, err2))
			}
		} else {
			cacheMutex.Unlock()
		}
		return
	}
	taskMount.Infof("Content from %v (%v) matches required SHA256 %v", fsContent, file, sha256)
	return
}

func extract(fsContent FSContent, format string, dir string, taskMount *TaskMount) (err error) {
	var cacheFile string
	cacheFile, _, err = ensureCached(fsContent, taskMount)
	if err != nil {
		log.Printf("Could not cache content: %v", err)
		return
	}
	err = MkdirAll(taskMount, dir)
	if err != nil {
		return
	}
	copyToPath := filepath.Join(taskMount.task.TaskDir(), filepath.Base(cacheFile))
	defer func() {
		taskMount.Infof("Removing file '%v'", copyToPath)
		err2 := os.Remove(copyToPath)
		if err == nil {
			err = err2
		}
	}()
	taskMount.Infof("Copying file '%v' to '%v'", cacheFile, copyToPath)
	_, err = fileutil.Copy(copyToPath, cacheFile)
	if err != nil {
		return
	}
	err = makeFileReadWritableForTaskUser(taskMount, copyToPath)
	if err != nil {
		return
	}
	taskMount.Infof("Extracting %v file %v to '%v'", format, copyToPath, dir)
	// Useful for worker logs too (not just task logs)
	log.Printf("[mounts] Extracting %v file %v to '%v'", format, copyToPath, dir)
	return unarchive(copyToPath, dir, format, taskMount.task.GetContext(), taskMount.task.pd)
}

func decompress(fsContent FSContent, format string, file string, taskMount *TaskMount) error {
	cacheFile, _, err := ensureCached(fsContent, taskMount)
	if err != nil {
		log.Printf("Could not cache content: %v", err)
		return err
	}

	parentDir := filepath.Dir(file)
	err = MkdirAll(taskMount, parentDir)
	// this could be a user error, if someone supplies an invalid path, so let's not
	// panic, but make this a task failure
	if err != nil {
		return err
	}

	if format == "" {
		// No compression, just copy file.
		// Let's copy rather than move, since we want to be totally sure that the
		// task can't modify the contents, and setting as read-only is not enough -
		// the user could change the rights and then modify it.
		dst, err := CreateFileAsTaskUser(file, taskMount.task.GetContext(), taskMount.task.pd)
		if err != nil {
			return fmt.Errorf("not able to create %v as task user: %v", file, err)
		}
		err = dst.Close()
		if err != nil {
			return fmt.Errorf("not able to close %v: %v", file, err)
		}
		taskMount.Infof("Copying %v to %v", cacheFile, file)
		err = copyFileContents(cacheFile, file)
		if err != nil {
			// this could be a system error, but it can also be that e.g. the task
			// specified an invalid path, so resolve as malformed payload rather
			// than panic
			taskMount.Errorf("not able to mount content from %v at path %v", fsContent.String(), file)
			return err
		}
		return nil
	}

	src, err := os.Open(cacheFile)
	if err != nil {
		return fmt.Errorf("not able to open %v: %v", cacheFile, err)
	}
	defer src.Close()

	// Identify the compression format using the format string as a
	// filename hint. Identify also validates the stream content matches.
	detected, stream, err := archives.Identify(context.Background(), "file."+format, src)
	if err != nil {
		return fmt.Errorf("unsupported or unrecognized decompression format %v: %w", format, err)
	}

	d, ok := detected.(archives.Decompressor)
	if !ok {
		return fmt.Errorf("format %v does not support decompression", format)
	}

	taskMount.Infof("Decompressing %v file %v to '%v'", format, cacheFile, file)
	// Useful for worker logs too (not just task logs)
	log.Printf("[mounts] Decompressing %v file %v to '%v'", format, cacheFile, file)
	dst, err := CreateFileAsTaskUser(file, taskMount.task.GetContext(), taskMount.task.pd)
	if err != nil {
		return fmt.Errorf("not able to create %v as task user: %v", file, err)
	}
	defer dst.Close()
	rc, err := d.OpenReader(stream)
	if err != nil {
		return fmt.Errorf("not able to decompress %v to %v: %v", cacheFile, file, err)
	}
	defer rc.Close()
	_, err = io.Copy(dst, rc)
	if err != nil {
		return fmt.Errorf("not able to decompress %v to %v: %v", cacheFile, file, err)
	}
	return nil
}

// FSContentFrom returns either a *ArtifactContent, *IndexedContent,
// *URLContent, *RawContent or *Base64Content based on the content
// (json.RawMessage)
func FSContentFrom(c json.RawMessage) (FSContent, error) {
	// c must be one of:
	//   * ArtifactContent
	//   * IndexedContent
	//   * URLContent
	//   * RawContent
	//   * Base64Content
	// We have to check keys to find out...
	var m map[string]any
	if err := json.Unmarshal(c, &m); err != nil {
		return nil, err
	}
	switch {
	// Select property names unique to a single type wherever possible.
	// Reordering the cases or changing property names to match on could break
	// things if property names are common to multiple types, so be careful!
	case m["taskId"] != nil:
		return UnmarshalInto(c, &ArtifactContent{})
	case m["namespace"] != nil:
		return UnmarshalInto(c, &IndexedContent{})
	case m["url"] != nil:
		return UnmarshalInto(c, &URLContent{})
	case m["raw"] != nil:
		return UnmarshalInto(c, &RawContent{})
	case m["base64"] != nil:
		return UnmarshalInto(c, &Base64Content{})
	}

	return nil, errors.New("unrecognised mount entry in payload")
}

// Utility method to unmarshal Content (json.RawMessage) into *ArtifactContent,
// *IndexedContent, *URLContent, *RawContent or *Base64Content (anything that
// implements FSContent interface)
func UnmarshalInto(c json.RawMessage, fsContent FSContent) (FSContent, error) {
	err := json.Unmarshal(c, fsContent)
	return fsContent, err
}

// Downloads ArtifactContent to a file inside the downloads directory specified
// in the global config file. The filename is a random slugid, and the
// absolute path of the file is returned.
func (ac *ArtifactContent) Download(taskMount *TaskMount) (file string, sha256 string, err error) {
	basename := slugid.Nice()
	file = filepath.Join(config.DownloadsDir, basename)

	taskMount.Infof("Downloading %v to %v", ac, file)

	var runID int64 = -1 // use the latest run
	taskMount.task.queueMux.RLock()
	queue := taskMount.task.Queue
	taskMount.task.queueMux.RUnlock()
	_, contentLength, err := queue.DownloadArtifactToFile(ac.TaskID, runID, ac.Artifact, file)
	if err != nil {
		return
	}

	sha256, err = fileutil.CalculateSHA256(file)
	if err != nil {
		taskMount.Infof("Downloaded %v bytes from %s to %v but cannot calculate SHA256", contentLength, ac, file)
		panic(fmt.Sprintf("Internal worker bug! Cannot calculate SHA256 of file %v that I just downloaded: %v", file, err))
	}
	taskMount.Infof("Downloaded %v bytes with SHA256 %v from %s to %v", contentLength, sha256, ac, file)
	return
}

func (ic *IndexedContent) Download(taskMount *TaskMount) (file string, sha256 string, err error) {
	itr, err := taskMount.index.FindTask(ic.Namespace)
	if err != nil {
		return "", "", err
	}
	ac := &ArtifactContent{
		Artifact: ic.Artifact,
		SHA256:   "",
		TaskID:   itr.TaskID,
	}
	return ac.Download(taskMount)
}

func (ac *ArtifactContent) String() string {
	return "task " + ac.TaskID + " artifact " + ac.Artifact
}

func (ic *IndexedContent) String() string {
	return "namespace " + ic.Namespace + " artifact " + ic.Artifact
}

func (ac *ArtifactContent) UniqueKey(taskMount *TaskMount) (string, error) {
	return "artifact:" + ac.TaskID + ":" + ac.Artifact, nil
}

func (ic *IndexedContent) UniqueKey(taskMount *TaskMount) (string, error) {
	itr, err := taskMount.index.FindTask(ic.Namespace)
	return "artifact:" + itr.TaskID + ":" + ic.Artifact, err
}

func (ac *ArtifactContent) RequiredSHA256() string {
	return ac.SHA256
}

func (ic *IndexedContent) RequiredSHA256() string {
	return ""
}

func (ac *ArtifactContent) TaskDependencies() []string {
	return []string{ac.TaskID}
}

func (ic *IndexedContent) TaskDependencies() []string {
	return []string{}
}

// Downloads URLContent to a file inside the caches directory specified in the
// global config file.  The filename is a random slugid, and the absolute path
// of the file is returned.
func (uc *URLContent) Download(taskMount *TaskMount) (file string, sha256 string, err error) {
	basename := slugid.Nice()
	file = filepath.Join(config.DownloadsDir, basename)
	sha256, _, err = DownloadFile(uc.URL, uc.String(), file, taskMount.task)
	return
}

func (uc *URLContent) String() string {
	return "url " + uc.URL
}

func (uc *URLContent) UniqueKey(taskMount *TaskMount) (string, error) {
	return "urlcontent:" + uc.URL, nil
}

func (uc *URLContent) RequiredSHA256() string {
	return uc.SHA256
}

func (uc *URLContent) TaskDependencies() []string {
	return []string{}
}

// Utility function to aggressively download a url to a file location
func DownloadFile(url, contentSource, file string, logger *TaskRun) (sha256, contentType string, err error) {
	var contentSize int64
	// httpbackoff.Get(url) is not sufficient as that only guarantees we have
	// an http response to read from, but does not retry if we lose
	// connectivity while reading from it. Therefore include the reading of the
	// response body inside the retry function.
	retryFunc := func() (resp *http.Response, tempError error, permError error) {
		logger.Infof("[mounts] Downloading %v to %v", contentSource, file)
		resp, err := http.Get(url)
		// assume all errors should result in a retry
		if err != nil {
			logger.Warnf("[mounts] Download of %v failed on this attempt: %v", contentSource, err)
			// temporary error!
			return resp, err, nil
		}
		defer resp.Body.Close()
		contentType = resp.Header.Get("Content-Type")
		f, err := os.OpenFile(file, os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0600)
		if err != nil {
			logger.Errorf("[mounts] Could not open file %v: %v", file, err)
			// permanent error!
			return resp, nil, err
		}
		defer f.Close()
		contentSize, err = io.Copy(f, resp.Body)
		if err != nil {
			logger.Warnf("[mounts] Could not write http response from %v to file %v on this attempt: %v", contentSource, file, err)
			// likely a temporary error - network blip
			return resp, err, nil
		}
		return resp, nil, nil
	}
	var resp *http.Response
	resp, _, err = httpbackoff.Retry(retryFunc)
	if err != nil {
		logger.Errorf("[mounts] Could not fetch from %v into file %v: %v", contentSource, file, err)
		return
	}
	defer resp.Body.Close()
	sha256, err = fileutil.CalculateSHA256(file)
	if err != nil {
		logger.Infof("[mounts] Downloaded %v bytes from %v to %v but cannot calculate SHA256", contentSize, contentSource, file)
		panic(fmt.Sprintf("Internal worker bug! Cannot calculate SHA256 of file %v that I just downloaded: %v", file, err))
	}
	logger.Infof("[mounts] Downloaded %v bytes with SHA256 %v from %v to %v", contentSize, sha256, contentSource, file)
	return
}

// RawContent to file
func (rc *RawContent) Download(taskMount *TaskMount) (file string, sha256 string, err error) {
	basename := slugid.Nice()
	file = filepath.Join(config.DownloadsDir, basename)
	sha256 = ""
	err = writeStringtoFile(rc.Raw, rc.String(), file, taskMount.task)
	return
}

func (rc *RawContent) String() string {
	return "Raw (" + rc.Raw + ")"
}

func (rc *RawContent) UniqueKey(taskMount *TaskMount) (string, error) {
	return "Raw content: " + rc.Raw, nil
}

func (rc *RawContent) RequiredSHA256() string {
	return ""
}

func (rc *RawContent) TaskDependencies() []string {
	return []string{}
}

// Base64Content to file
func (bc *Base64Content) Download(taskMount *TaskMount) (file string, sha256 string, err error) {
	basename := slugid.Nice()
	file = filepath.Join(config.DownloadsDir, basename)
	sha256 = ""
	err = writeStringtoFile(bc.Base64, bc.String(), file, taskMount.task)
	return
}

func (bc *Base64Content) String() string {
	return "Base64 (" + bc.Base64 + ")"
}

func (bc *Base64Content) UniqueKey(taskMount *TaskMount) (string, error) {
	return "Base64 content: " + bc.Base64, nil
}

func (bc *Base64Content) RequiredSHA256() string {
	return ""
}

func (bc *Base64Content) TaskDependencies() []string {
	return []string{}
}

// Copying String to File
func writeStringtoFile(content, contentSource, file string, task *TaskRun) (err error) {
	task.Infof("[mounts] Copying %v to %v", contentSource, file)
	f, err := os.OpenFile(file, os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		task.Errorf("[mounts] Could not open file %v: %v", file, err)
		// permanent error!
		return err
	}
	defer f.Close()
	contentSize, err := f.WriteString(content)
	if err != nil {
		task.Errorf("[mounts] Could not copy %v to %v", contentSource, file)
		return err
	}
	task.Infof("[mounts] Copied %v bytes from %v to %v", contentSize, contentSource, file)
	return err
}

func (taskMount *TaskMount) purgeCaches() error {
	// Don't bother to query purge cache service if this task uses no writable
	// caches, and we queried already less than 6 hours ago. Service keeps
	// history for 24 hours, but is an implementation detail that could change.
	// Until we have a formal guarantee, let's run after 6 hours to be super
	// safe.
	writableCaches := []*WritableDirectoryCache{}
	for _, mount := range taskMount.mounts {
		switch t := mount.(type) {
		case *WritableDirectoryCache:
			writableCaches = append(writableCaches, t)
		}
	}
	// Round(0) forces wall time calculation instead of monotonic time in case machine slept etc
	cacheMutex.Lock()
	lastQueried := lastQueriedPurgeCacheService
	cacheMutex.Unlock()
	if len(writableCaches) == 0 && time.Now().Round(0).Sub(lastQueried) < 6*time.Hour {
		return nil
	}
	// In case of clock drift, let's query all purge cache requests created
	// since 5 mins before our last request. In the worst case, it means we'll
	// get back more results than we need, but it won't cause us to clear
	// caches we shouldn't. This helps if the worker clock is up to 5 minutes
	// ahead of the purgecache service clock. If the worker clock is behind the
	// purgecache service clock, that is also no problem.  If this is the first
	// request since the worker started, we won't pass in a "since" date at
	// all.
	since := ""
	cacheMutex.Lock()
	if !lastQueriedPurgeCacheService.IsZero() {
		since = tcclient.Time(lastQueriedPurgeCacheService.Add(-5 * time.Minute)).String()
	}
	lastQueriedPurgeCacheService = time.Now()
	cacheMutex.Unlock()
	pc := serviceFactory.PurgeCache(config.Credentials(), config.RootURL)
	purgeRequests, err := pc.PurgeRequests(fmt.Sprintf("%s/%s", config.ProvisionerID, config.WorkerType), since)
	if err != nil {
		return err
	}
	// Loop through results, and purge caches when we find an entry. Note,
	// again to account for clock drift, let's remove caches up to 5 minutes
	// older than the given "before" date.
	cacheMutex.Lock()
	defer cacheMutex.Unlock()
	for _, request := range purgeRequests.Requests {
		entries, exists := directoryCaches[request.CacheName]
		if !exists {
			continue
		}
		// Evict available entries that are older than the purge request.
		// In-use entries that match are marked for deferred eviction
		// so they don't return to the pool with stale content.
		// Allocate a fresh slice rather than aliasing entries[:0] so a
		// mid-loop RemoveAll error doesn't leave directoryCaches pointing
		// at a partially-overwritten backing array.
		remaining := make([]*Cache, 0, len(entries))
		// Collect RemoveAll failures and surface them at the end of
		// the loop so the map writeback below still runs and entries
		// whose disk content was successfully removed are dropped.
		// Returning mid-loop would leave directoryCaches[name] still
		// referencing the now-deleted entry, and the next task to
		// AcquireCache for that name would be handed a *Cache whose
		// Location points at a half-removed directory.
		var removeErrs []error
		for _, cache := range entries {
			if cache.Created.Add(-5 * time.Minute).Before(time.Time(request.Before)) {
				if cache.InUse {
					taskMount.Infof("Marking in-use cache %v for deferred purge", cache.Key)
					cache.NeedsPurge = true
					remaining = append(remaining, cache)
					continue
				}
				taskMount.Infof("Removing cache %v from cache table (purge request)", cache.Key)
				taskMount.Infof("Deleting cache %v file(s) at %v", cache.Key, cache.Location)
				if rmErr := os.RemoveAll(cache.Location); rmErr != nil {
					taskMount.Errorf("Could not delete cache %v at %v: %v (will retry on next purge)", cache.Key, cache.Location, rmErr)
					removeErrs = append(removeErrs, rmErr)
					// Keep the entry so the next purge sweep retries
					// the deletion. AcquireCache skips NeedsPurge
					// entries, so it won't be handed to a follow-up
					// task in the meantime.
					cache.NeedsPurge = true
					remaining = append(remaining, cache)
				}
			} else {
				remaining = append(remaining, cache)
			}
		}
		if len(remaining) == 0 {
			delete(directoryCaches, request.CacheName)
		} else {
			directoryCaches[request.CacheName] = remaining
		}
		if len(removeErrs) > 0 {
			// Surface the first failure once per cache name. Joining
			// preserves the rest in errors.Is/As traversal if a
			// caller cares.
			return errors.Join(removeErrs...)
		}
	}
	return nil
}
