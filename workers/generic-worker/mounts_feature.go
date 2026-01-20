package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/user"
	"path/filepath"
	"sort"
	"time"

	"slices"

	"github.com/mholt/archiver/v3"
	"github.com/taskcluster/httpbackoff/v3"
	"github.com/taskcluster/slugid-go/slugid"
	tcclient "github.com/taskcluster/taskcluster/v96/clients/client-go"
	"github.com/taskcluster/taskcluster/v96/internal/mocktc/tc"
	"github.com/taskcluster/taskcluster/v96/internal/scopes"
	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/fileutil"
)

var (
	// downloaded files that may be archives or individual files are stored in
	// fileCache, against a unique key that identifies where they were
	// downloaded from. The map values are the paths of the downloaded files
	// relative to the downloads directory specified in the global config file
	// on the worker.
	fileCaches CacheMap
	// writable directory caches that may be preloaded or initially empty. Note
	// a preloaded cache will have an associated file cache for the archive it
	// was created from. The key is the cache name.
	directoryCaches CacheMap
	// we track this in order to reduce number of results we get back from
	// purge cache service
	lastQueriedPurgeCacheService time.Time
)

type (
	CacheMap map[string]*Cache
)

func (cm CacheMap) SortedResources() Resources {
	r := make(Resources, len(cm))
	i := 0
	for _, cache := range cm {
		r[i] = cache
		i++
	}
	sort.Sort(r)
	return r
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
	Owner CacheMap `json:"-"`
	// The key used in the CacheMap
	Key string `json:"key"`
	// SHA256 of content, if a file (not used for directories)
	SHA256 string `json:"sha256"`
	// Keeps a record of which task user mounts this cache. This is so that
	// when the cache is mounted as a new task user, file ownership can be
	// recursively changed from the previous task user to the new task user.
	//
	// Note, although uid is typically a uint32, we store as a string since
	// that is how the standard library passes it to us, and we pass it to
	// task commands as a string, so this avoids converting from string to
	// uint32 and then back again. We use a uid rather than username, since
	// task users get deleted, so the system may no longer recognise the
	// previous task user username, but uids should remain intact.
	//
	// Since: generic-worker 75.0.0
	OwnerUsername string `json:"ownerUsername"`
	OwnerUID      string `json:"mounterUID"`
}

// Rating determines how valuable the file cache is compared to other file
// caches. We will base this entirely on how many times it was used before.
// The more times it was referenced in a task that already ran on this
// worker, the higher the rating will be. For now we'll disregard disk
// space taken up.
func (cache *Cache) Rating() float64 {
	return float64(cache.Hits)
}

func (cache *Cache) Evict(taskMount *TaskMount) error {
	if taskMount != nil {
		taskMount.Infof("Removing cache %v from cache table", cache.Key)
	}
	delete(cache.Owner, cache.Key)
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
	return MkdirAllTaskUser(dir, taskMount.task.pd)
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
	err = loadFromJSONFile(cm, stateFile)
	if err != nil {
		panic(err)
	}
	for i := range *cm {
		// Github Issues: #5363, #5396
		// Bugzilla Bug: https://bugzilla.mozilla.org/show_bug.cgi?id=1595217
		// Loop through cache entries, and remove any that refer to files/dirs that do not exist.
		// Log a warning in worker log, and don't raise an exception.
		if _, err = os.Stat((*cm)[i].Location); err != nil {
			log.Printf("WARNING: Cache %#v missing on worker - corrupt internal state, ignoring!", (*cm)[i])
			// note, this should be safe, despite looking scary:
			// https://stackoverflow.com/questions/23229975/is-it-safe-to-remove-selected-keys-from-map-within-a-range-loop
			delete(*cm, i)
		} else {
			(*cm)[i].Owner = *cm
		}
	}
}

func (feature *MountsFeature) Initialise() error {
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
		task:    task,
		mounts:  []MountEntry{},
		mounted: []MountEntry{},
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
func garbageCollection() error {
	r := fileCaches.SortedResources()
	r = append(r, directoryCaches.SortedResources()...)
	return runGarbageCollection(r)
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
				err.add(Failure(directoryCaches[cache.CacheName].Evict(taskMount)))
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
	err.add(executionError(internalError, errored, fileutil.WriteToFileAsJSON(&fileCaches, "file-caches.json")))
	err.add(executionError(internalError, errored, fileutil.WriteToFileAsJSON(&directoryCaches, "directory-caches.json")))
	err.add(executionError(internalError, errored, fileutil.SecureFiles("file-caches.json", "directory-caches.json")))
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

func (w *WritableDirectoryCache) Mount(taskMount *TaskMount) error {
	target := filepath.Join(taskContext.TaskDir, w.Directory)
	// cache already there?
	if _, dirCacheExists := directoryCaches[w.CacheName]; dirCacheExists {
		// bump counter
		directoryCaches[w.CacheName].Hits++
		// move it into place...
		src := directoryCaches[w.CacheName].Location
		parentDir := filepath.Dir(target)
		taskMount.Infof("Moving existing writable directory cache %v from %v to %v", w.CacheName, src, target)
		err := MkdirAll(taskMount, parentDir)
		if err != nil {
			return fmt.Errorf("not able to create directory %v: %v", parentDir, err)
		}
		err = RenameCrossDevice(src, target)
		if err != nil {
			panic(fmt.Errorf("[mounts] Not able to rename dir %v as %v: %v", src, target, err))
		}
	} else {
		// new cache, let's initialise it...
		basename := slugid.Nice()
		file := filepath.Join(config.CachesDir, basename)
		taskMount.Infof("No existing writable directory cache '%v' - creating %v", w.CacheName, file)
		currentUser, err := user.Current()
		if err != nil {
			panic(fmt.Errorf("[mounts] Not able to look up UID for current user: %w", err))
		}
		directoryCaches[w.CacheName] = &Cache{
			Hits:          1,
			Created:       time.Now(),
			Location:      file,
			Owner:         directoryCaches,
			Key:           w.CacheName,
			OwnerUsername: currentUser.Username,
			OwnerUID:      currentUser.Uid,
		}
		// preloaded content?
		if w.Content != nil {
			c, err := FSContentFrom(w.Content)
			if err != nil {
				return fmt.Errorf("not able to retrieve FSContent: %v", err)
			}
			err = extract(c, w.Format, target, taskMount)
			if err != nil {
				return err
			}
		} else {
			// no preloaded content => just create dir in place
			err := MkdirAll(taskMount, target)
			if err != nil {
				return fmt.Errorf("not able to create directory %v: %v", target, err)
			}
		}
	}
	// Regardless of whether we are running as current user, grant task user access
	// since the mounted folder sits inside the task directory of the task user,
	// which is owned and controlled by the task user, even if commands execute as
	// LocalSystem, the file system resources should still be owned by task user.
	err := exchangeDirectoryOwnership(taskMount, target, directoryCaches[w.CacheName])
	if err != nil {
		panic(err)
	}
	taskMount.Infof("Successfully mounted writable directory cache '%v'", target)
	return nil
}

func (w *WritableDirectoryCache) Unmount(taskMount *TaskMount) error {
	cache := directoryCaches[w.CacheName]
	cacheDir := cache.Location
	taskCacheDir := filepath.Join(taskContext.TaskDir, w.Directory)
	taskMount.Infof("Preserving cache: Moving %q to %q", taskCacheDir, cacheDir)
	err := RenameCrossDevice(taskCacheDir, cacheDir)
	if err != nil {
		// An error can occur for several reasons:
		//
		// Task problems:
		// T1) The move was transformed into copy/delete semantics, e.g. if
		// cache persistence directory is on a different drive. Perhaps the
		// delete failed due to file handles being held by orphaned processes.
		// Test TestAbortAfterMaxRunTime simulates this.
		// T2) Maybe the task moved/deleted the cache, or altered ACLs which
		// caused the move to fail.
		//
		// Worker problems:
		// W1) Perhaps a genuine worker issue - disk fault, drive full, etc.
		//
		// It is non-trivial to diagnose whether it is a task issue (=> resolve
		// task as failure) or a worker issue (=> resolve task as exception and
		// trigger internal-error to quarantine/terminate worker). Therefore
		// assume it is a task problem not a worker problem, and if we are
		// wrong, in the worst case we just have performance degredation on
		// this worker since it cannot persist the cache. Hopefully if there is
		// a more serious issue, it will be detected via another mechanism and
		// cause an internal-error.
		evictErr := cache.Evict(taskMount)
		// If we can't remove the cacheDir, then something nasty is going on
		// since this is in a location that the task shouldn't be writing to...
		if evictErr != nil {
			panic(evictErr)
		}
		// The cache directory inside the task (taskCacheDir) will in any case
		// be cleaned up when task folder is deleted so no need to do anything
		// with it.
		return Failure(fmt.Errorf("could not persist cache %q due to %v", cache.Key, err))
	}
	return nil
}

func (r *ReadOnlyDirectory) Mount(taskMount *TaskMount) error {
	c, err := FSContentFrom(r.Content)
	if err != nil {
		return fmt.Errorf("not able to retrieve FSContent: %v", err)
	}
	dir := filepath.Join(taskContext.TaskDir, r.Directory)
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

	file := filepath.Join(taskContext.TaskDir, f.File)
	if info, err := os.Stat(file); err == nil && info.IsDir() {
		return fmt.Errorf("cannot mount file at path %v since it already exists as a directory", file)
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
func ensureCached(fsContent FSContent, taskMount *TaskMount) (file string, err error) {
	cacheKey, err := fsContent.UniqueKey(taskMount)
	if err != nil {
		return "", err
	}
	var sha256 string
	requiredSHA256 := fsContent.RequiredSHA256()
	if _, inCache := fileCaches[cacheKey]; inCache {
		file = fileCaches[cacheKey].Location
		// Sanity check - if file is in file map, but not on file system,
		// something is seriously wrong, so should be a worker exception
		// (panic), not a task failure
		_, err = os.Stat(file)
		if err != nil {
			panic(fmt.Errorf("file in cache, but not on filesystem: %v", *fileCaches[cacheKey]))
		}
		fileCaches[cacheKey].Hits++

		// validate SHA256 in case of either tampering or new content at url...
		sha256, err = fileutil.CalculateSHA256(file)
		if err != nil {
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
		err = fileCaches[cacheKey].Evict(taskMount)
		if err != nil {
			panic(fmt.Errorf("could not delete cache entry %v: %v", fileCaches[cacheKey], err))
		}
	}
	file, sha256, err = fsContent.Download(taskMount)
	if err != nil {
		taskMount.Errorf("Could not fetch from %v into file %v due to %v", fsContent, file, err)
		return
	}
	fileCaches[cacheKey] = &Cache{
		Location: file,
		Hits:     1,
		Created:  time.Now(),
		Owner:    fileCaches,
		Key:      cacheKey,
		SHA256:   sha256,
	}
	if requiredSHA256 == "" {
		taskMount.Warnf("Download %v of %v has SHA256 %v but task payload does not declare a required value, so content authenticity cannot be verified", file, fsContent, sha256)
		return
	}
	if requiredSHA256 != sha256 {
		err = fmt.Errorf("Download %v of %v has SHA256 %v but task definition explicitly requires %v; not retrying download as there were no connection failures and HTTP response status code was 200", file, fsContent, sha256, requiredSHA256)
		err2 := fileCaches[cacheKey].Evict(taskMount)
		if err2 != nil {
			panic(fmt.Errorf("could not delete cache entry %v: %v", fileCaches[cacheKey], err2))
		}
		return
	}
	taskMount.Infof("Content from %v (%v) matches required SHA256 %v", fsContent, file, sha256)
	return
}

func extract(fsContent FSContent, format string, dir string, taskMount *TaskMount) (err error) {
	var cacheFile string
	cacheFile, err = ensureCached(fsContent, taskMount)
	if err != nil {
		log.Printf("Could not cache content: %v", err)
		return
	}
	err = MkdirAll(taskMount, dir)
	if err != nil {
		return
	}
	copyToPath := filepath.Join(taskContext.TaskDir, filepath.Base(cacheFile))
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
	return unarchive(copyToPath, dir, format, taskMount.task.pd)
}

func decompress(fsContent FSContent, format string, file string, taskMount *TaskMount) error {
	cacheFile, err := ensureCached(fsContent, taskMount)
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

	var d archiver.Decompressor
	switch format {
	case "bz2":
		d = &archiver.Bz2{}
	case "gz":
		d = &archiver.Gz{}
	case "lz4":
		d = &archiver.Lz4{}
	case "xz":
		d = &archiver.Xz{}
	case "zst":
		d = &archiver.Zstd{}
	case "":
		// No compression, just copy file.
		// Let's copy rather than move, since we want to be totally sure that the
		// task can't modify the contents, and setting as read-only is not enough -
		// the user could change the rights and then modify it.
		dst, err := CreateFileAsTaskUser(file, taskMount.task.pd)
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
	default:
		return fmt.Errorf("unsupported decompression format %v", format)
	}

	taskMount.Infof("Decompressing %v file %v to '%v'", format, cacheFile, file)
	// Useful for worker logs too (not just task logs)
	log.Printf("[mounts] Decompressing %v file %v to '%v'", format, cacheFile, file)
	src, err := os.Open(cacheFile)
	if err != nil {
		return fmt.Errorf("not able to open %v: %v", cacheFile, err)
	}
	defer src.Close()
	dst, err := CreateFileAsTaskUser(file, taskMount.task.pd)
	if err != nil {
		return fmt.Errorf("not able to create %v as task user: %v", file, err)
	}
	defer dst.Close()
	err = d.Decompress(src, dst)
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
	_, contentLength, err := taskMount.task.Queue.DownloadArtifactToFile(ac.TaskID, runID, ac.Artifact, file)
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
	if len(writableCaches) == 0 && time.Now().Round(0).Sub(lastQueriedPurgeCacheService) < 6*time.Hour {
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
	if !lastQueriedPurgeCacheService.IsZero() {
		since = tcclient.Time(lastQueriedPurgeCacheService.Add(-5 * time.Minute)).String()
	}
	lastQueriedPurgeCacheService = time.Now()
	pc := serviceFactory.PurgeCache(config.Credentials(), config.RootURL)
	purgeRequests, err := pc.PurgeRequests(fmt.Sprintf("%s/%s", config.ProvisionerID, config.WorkerType), since)
	if err != nil {
		return err
	}
	// Loop through results, and purge caches when we find an entry. Note,
	// again to account for clock drift, let's remove caches up to 5 minutes
	// older than the given "before" date.
	for _, request := range purgeRequests.Requests {
		if cache, exists := directoryCaches[request.CacheName]; exists {
			if cache.Created.Add(-5 * time.Minute).Before(time.Time(request.Before)) {
				err := cache.Evict(taskMount)
				if err != nil {
					panic(err)
				}
			}
		}
	}
	return nil
}
