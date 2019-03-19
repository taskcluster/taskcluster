package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/mholt/archiver"
	"github.com/taskcluster/generic-worker/fileutil"
	"github.com/taskcluster/httpbackoff"
	"github.com/taskcluster/slugid-go/slugid"
	"github.com/taskcluster/taskcluster-base-go/scopes"
	tcclient "github.com/taskcluster/taskcluster-client-go"
	"github.com/taskcluster/taskcluster-client-go/tcpurgecache"
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
	// service to call to see if any caches need to be purged. See
	// https://docs.taskcluster.net/reference/core/purge-cache
	pc *tcpurgecache.PurgeCache
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
}

// Rating determines how valuable the file cache is compared to other file
// caches. We will base this entirely on how many times it was used before.
// The more times it was referenced in a task that already ran on this
// worker, the higher the rating will be. For now we'll disregard disk
// space taken up.
func (cache *Cache) Rating() float64 {
	return float64(cache.Hits)
}

func (cache *Cache) Expunge(task *TaskRun) error {
	task.Infof("[mounts] Removing cache %v from cache table", cache.Key)
	delete(cache.Owner, cache.Key)
	if task != nil {
		task.Infof("[mounts] Deleting cache %v file(s) at %v", cache.Key, cache.Location)
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

func (feature *MountsFeature) PersistState() (err error) {
	err = fileutil.WriteToFileAsJSON(&fileCaches, "file-caches.json")
	if err != nil {
		return
	}
	err = fileutil.WriteToFileAsJSON(&directoryCaches, "directory-caches.json")
	return
}

func MkdirAll(task *TaskRun, dir string, perms os.FileMode) error {
	task.Infof("[mounts] Creating directory %v with permissions 0%o", dir, perms)
	return os.MkdirAll(dir, perms)
}

func MkdirAllOrDie(task *TaskRun, dir string, perms os.FileMode) {
	err := MkdirAll(task, dir, perms)
	if err != nil {
		panic(fmt.Errorf("[mounts] Not able to create directory %v with permissions %o: %v", dir, perms, err))
	}
}

func (cm *CacheMap) LoadFromFile(stateFile string, cacheDir string) {
	_, err := os.Stat(stateFile)
	if err != nil {
		log.Printf("No %v file found, creating empty CacheMap", stateFile)
		*cm = CacheMap{}
		perms := os.FileMode(0700)
		log.Printf("Creating directory %v with permissions %o", cacheDir, perms)
		err := os.MkdirAll(cacheDir, perms)
		if err != nil {
			panic(fmt.Errorf("[mounts] Not able to create directory %v with permissions %o: %v", cacheDir, perms, err))
		}
		return
	}
	err = loadFromJSONFile(cm, stateFile)
	if err != nil {
		panic(err)
	}
	for i := range *cm {
		(*cm)[i].Owner = *cm
	}
}

func (feature *MountsFeature) Initialise() error {
	fileCaches.LoadFromFile("file-caches.json", config.CachesDir)
	directoryCaches.LoadFromFile("directory-caches.json", config.DownloadsDir)
	pc = config.PurgeCache()
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
}

// Represents an individual Mount listed in task payload - there
// can be several mounts per task
type MountEntry interface {
	Mount(task *TaskRun) error
	Unmount(task *TaskRun) error
	FSContent() (FSContent, error)
	RequiredScopes() []string
}

// FSContent represents file system content - it is based on the auto-generated
// type Content which is json.RawMessage, which can be ArtifactContent,
// URLContent, RawContent or Base64Content concrete types. This is the
// interface which represents these underlying concrete types.
type FSContent interface {
	// Keep it simple and just return a []string, rather than scopes.Required
	// since currently no easy way to "AND" scopes.Required types.
	RequiredScopes() []string
	// Download the content, and return the absolute location of the file. No
	// archive extraction is performed.
	Download(task *TaskRun) (file string, sha256 string, err error)
	// UniqueKey returns a string which represents the content, such that if
	// two FSContent types return the same key, it can be assumed they
	// represent the same content.
	UniqueKey() string
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

// Scopes queue:get-artifact:<artifact-name> required for non public/ artifacts
func (ac *ArtifactContent) RequiredScopes() []string {
	if strings.HasPrefix(ac.Artifact, "public/") {
		return []string{}
	}
	return []string{"queue:get-artifact:" + ac.Artifact}
}

//No scopes required to mount files in a task
func (rc *RawContent) RequiredScopes() []string {
	return []string{}
}

func (bc *Base64Content) RequiredScopes() []string {
	return []string{}
}

// Since mounts are protected by scopes per mount, no reason to have
// a feature flag to enable. Having mounts in the payload is enough.
func (feature *MountsFeature) IsEnabled(task *TaskRun) bool {
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
		var m map[string]interface{}
		if err := json.Unmarshal(taskMount, &m); err != nil {
			tm.payloadError = fmt.Errorf("Could not read task mount %v: %v\n%v", i, string(taskMount), err)
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
			tm.payloadError = fmt.Errorf("Unrecognised mount entry in payload - %#v", m)
		}
	}
	tm.initRequiredScopes()
	tm.initReferencedTaskIDs()
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
	//   https://docs.taskcluster.net/reference/core/purge-cache
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
		taskMount.task.Warn("[mounts] Could not reach purgecache service to see if caches need purging:")
		taskMount.task.Warn("[mounts] " + err.Error())
	}
	// loop through all mounts described in payload
	for _, mount := range taskMount.mounts {
		err = mount.Mount(taskMount.task)
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
	// loop through all mounts described in payload
	for i, mount := range taskMount.mounted {
		e := mount.Unmount(taskMount.task)
		if e != nil {
			fsc, errfsc := mount.FSContent()
			if errfsc != nil {
				taskMount.task.Errorf("[mounts] Could not unmount mount entry %v (description not available due to '%v') due to: '%v'", i, errfsc, e)
			} else {
				taskMount.task.Errorf("[mounts] Could not unmount %v due to: '%v'", fsc, e)
			}
			err.add(Failure(e))
		}
	}
}

// Writable caches require scope generic-worker:cache:<cacheName>. Preloaded
// caches from an artifact may also require scopes - handled separately.
func (w *WritableDirectoryCache) RequiredScopes() []string {
	return []string{"generic-worker:cache:" + w.CacheName}
}

// FSContent returns either a *URLContent *ArtifactContent, *RawContent or *Base64Content
// that is listed in the given *WritableDirectoryCache
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

// FSContent returns either a *URLContent, *ArtifactContent, *RawContent or
// *Base64Content that is listed in the given *ReadOnlyDirectory
func (r *ReadOnlyDirectory) FSContent() (FSContent, error) {
	return FSContentFrom(r.Content)
}

// No scopes directly required for a FileMount (scopes may be required for its
// content though - handled separately)
func (f *FileMount) RequiredScopes() []string {
	return []string{}
}

// FSContent returns either a *URLContent, *ArtifactContent, *RawContent or
// *Base64Content that is listed in the given *FileMount
func (f *FileMount) FSContent() (FSContent, error) {
	return FSContentFrom(f.Content)
}

func (w *WritableDirectoryCache) Mount(task *TaskRun) error {
	target := filepath.Join(taskContext.TaskDir, w.Directory)
	// cache already there?
	if _, dirCacheExists := directoryCaches[w.CacheName]; dirCacheExists {
		// bump counter
		directoryCaches[w.CacheName].Hits++
		// move it into place...
		src := directoryCaches[w.CacheName].Location
		parentDir := filepath.Dir(target)
		task.Infof("[mounts] Moving existing writable directory cache %v from %v to %v", w.CacheName, src, target)
		MkdirAllOrDie(task, parentDir, 0700)
		err := RenameCrossDevice(src, target)
		if err != nil {
			panic(fmt.Errorf("[mounts] Not able to rename dir %v as %v: %v", src, target, err))
		}
	} else {
		// new cache, let's initialise it...
		basename := slugid.Nice()
		file := filepath.Join(config.CachesDir, basename)
		task.Infof("[mounts] No existing writable directory cache '%v' - creating %v", w.CacheName, file)
		directoryCaches[w.CacheName] = &Cache{
			Hits:     1,
			Created:  time.Now(),
			Location: file,
			Owner:    directoryCaches,
			Key:      w.CacheName,
		}
		// preloaded content?
		if w.Content != nil {
			c, err := FSContentFrom(w.Content)
			if err != nil {
				return fmt.Errorf("Not able to retrieve FSContent: %v", err)
			}
			err = extract(c, w.Format, target, task)
			if err != nil {
				return err
			}
		} else {
			// no preloaded content => just create dir in place
			MkdirAllOrDie(task, target, 0700)
		}
	}
	// Regardless of whether we are running as current user, grant task user access
	// since the mounted folder sits inside the task directory of the task user,
	// which is owned and controlled by the task user, even if commands execute as
	// LocalSystem, the file system resources should still be owned by task user.
	err := makeDirReadableForTaskUser(task, target)
	if err != nil {
		panic(err)
	}
	task.Infof("[mounts] Successfully mounted writable directory cache '%v'", target)
	return nil
}

func (w *WritableDirectoryCache) Unmount(task *TaskRun) error {
	cache := directoryCaches[w.CacheName]
	cacheDir := cache.Location
	taskCacheDir := filepath.Join(taskContext.TaskDir, w.Directory)
	task.Infof("[mounts] Preserving cache: Moving %q to %q", taskCacheDir, cacheDir)
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
		expungeErr := cache.Expunge(task)
		// If we can't remove the cacheDir, then something nasty is going on
		// since this is in a location that the task shouldn't be writing to...
		if expungeErr != nil {
			panic(expungeErr)
		}
		// The cache directory inside the task (taskCacheDir) will in any case
		// be cleaned up when task folder is deleted so no need to do anything
		// with it.
		return Failure(fmt.Errorf("Could not persist cache %q due to %v", cache.Key, err))
	}
	// Regardless of whether we are running as current user, remove task user access
	// since the mounted folder sits inside the task directory of the task user,
	// and would have been granted access, which should be removed since next time
	// it is mounted, a different task user account should be active.
	err = makeDirUnreadableForTaskUser(task, cacheDir)
	if err != nil {
		panic(err)
	}
	return nil
}

func (r *ReadOnlyDirectory) Mount(task *TaskRun) error {
	c, err := FSContentFrom(r.Content)
	if err != nil {
		return fmt.Errorf("Not able to retrieve FSContent: %v", err)
	}
	return extract(c, r.Format, filepath.Join(taskContext.TaskDir, r.Directory), task)
}

// Nothing to do - original archive file wasn't moved
func (r *ReadOnlyDirectory) Unmount(task *TaskRun) error {
	return nil
}

func (f *FileMount) Mount(task *TaskRun) error {
	fsContent, err := FSContentFrom(f.Content)
	if err != nil {
		return err
	}
	cacheFile, err := ensureCached(fsContent, task)
	if err != nil {
		return err
	}
	file := filepath.Join(taskContext.TaskDir, f.File)
	parentDir := filepath.Dir(file)
	err = MkdirAll(task, parentDir, 0700)
	// this could be a user error, if someone supplies an invalid path, so let's not
	// panic, but make this a task failure
	if err != nil {
		return err
	}
	// Let's copy rather than move, since we want to be totally sure that the
	// task can't modify the contents, and setting as read-only is not enough -
	// the user could change the rights and then modify it.
	task.Infof("[mounts] Copying %v to %v", cacheFile, file)
	err = copyFileContents(cacheFile, file)
	if err != nil {
		// this could be a system error, but it can also be that e.g. the task
		// specified an invalid path, so resolve as malformed payload rather
		// than panic
		task.Errorf("[mounts] Not able to mount content from %v at path %v", fsContent.String(), file)
		task.Infof("%v", err)
		return err
	}
	return nil
}

// Nothing to do - original archive file was copied, not moved
func (f *FileMount) Unmount(task *TaskRun) error {
	return nil
}

// ensureCached returns a file containing the given content
func ensureCached(fsContent FSContent, task *TaskRun) (file string, err error) {
	cacheKey := fsContent.UniqueKey()
	var sha256 string
	requiredSHA256 := fsContent.RequiredSHA256()
	if _, inCache := fileCaches[cacheKey]; inCache {
		file = fileCaches[cacheKey].Location
		// Sanity check - if file is in file map, but not on file system,
		// something is seriously wrong, so should be a worker exception
		// (panic), not a task failure
		_, err = os.Stat(file)
		if err != nil {
			panic(fmt.Errorf("File in cache, but not on filesystem: %v", *fileCaches[cacheKey]))
		}
		fileCaches[cacheKey].Hits++

		// validate SHA256 in case of either tampering or new content at url...
		sha256, err = fileutil.CalculateSHA256(file)
		if err != nil {
			panic(fmt.Sprintf("Internal worker bug! Cannot calculate SHA256 of file %v that I have in my cache: %v", file, err))
		}
		if requiredSHA256 == "" {
			task.Warnf("[mounts] No SHA256 specified in task mounts for %v - SHA256 from downloaded file %v is %v.", cacheKey, file, sha256)
			return
		}
		if requiredSHA256 == sha256 {
			task.Infof("[mounts] Found existing download for %v (%v) with correct SHA256 %v", cacheKey, file, sha256)
			return
		}
		task.Infof("Found existing download of %v (%v) with SHA256 %v but task definition explicitly requires %v so deleting it", cacheKey, file, sha256, requiredSHA256)
		err = fileCaches[cacheKey].Expunge(task)
		if err != nil {
			panic(fmt.Errorf("Could not delete cache entry %v: %v", fileCaches[cacheKey], err))
		}
	}
	file, sha256, err = fsContent.Download(task)
	if err != nil {
		task.Errorf("Could not download %v to %v due to %v", fsContent.UniqueKey(), file, err)
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
		task.Warnf("[mounts] Download %v of %v has SHA256 %v but task payload does not declare a required value, so content authenticity cannot be verified", file, fsContent, sha256)
		return
	}
	if requiredSHA256 != sha256 {
		err = fmt.Errorf("Download %v of %v has SHA256 %v but task definition explicitly requires %v; not retrying download as there were no connection failures and HTTP response status code was 200", file, fsContent, sha256, requiredSHA256)
		err2 := fileCaches[cacheKey].Expunge(task)
		if err2 != nil {
			panic(fmt.Errorf("Could not delete cache entry %v: %v", fileCaches[cacheKey], err2))
		}
		return
	}
	task.Infof("[mounts] Content from %v (%v) matches required SHA256 %v", fsContent, file, sha256)
	return
}

func extract(fsContent FSContent, format string, dir string, task *TaskRun) error {
	cacheFile, err := ensureCached(fsContent, task)
	if err != nil {
		log.Printf("Could not cache content: %v", err)
		return err
	}
	err = MkdirAll(task, dir, 0700)
	if err != nil {
		return err
	}
	task.Infof("[mounts] Extracting %v file %v to '%v'", format, cacheFile, dir)
	switch format {
	case "zip":
		return archiver.Zip.Open(cacheFile, dir)
	case "tar.gz":
		return archiver.TarGz.Open(cacheFile, dir)
	case "rar":
		return archiver.Rar.Open(cacheFile, dir)
	case "tar.bz2":
		return archiver.TarBz2.Open(cacheFile, dir)
	}
	log.Fatalf("Unsupported format %v", format)
	return fmt.Errorf("Unsupported archive format %v", format)
}

// FSContentFrom returns either a *ArtifactContent or *URLContent or *RawContent or *Base64Content based on the content
// (json.RawMessage)
func FSContentFrom(c json.RawMessage) (FSContent, error) {
	// c must be one of:
	//   * ArtifactContent
	//   * URLContent
	//   * RawContent
	//   * Base64Content
	// We have to check keys to find out...
	var m map[string]interface{}
	if err := json.Unmarshal(c, &m); err != nil {
		return nil, err
	}
	switch {
	case m["artifact"] != nil:
		return UnmarshalInto(c, &ArtifactContent{})
	case m["url"] != nil:
		return UnmarshalInto(c, &URLContent{})
	case m["raw"] != nil:
		return UnmarshalInto(c, &RawContent{})
	case m["base64"] != nil:
		return UnmarshalInto(c, &Base64Content{})
	}

	return nil, errors.New("Unrecognised mount entry in payload")
}

// Utility method to unmarshal Content (json.RawMessage) into *ArtifactContent
// or *URLContent (or anything that implements FSContent interface)
func UnmarshalInto(c json.RawMessage, fsContent FSContent) (FSContent, error) {
	err := json.Unmarshal(c, fsContent)
	return fsContent, err
}

// Downloads ArtifactContent to a file inside the downloads directory specified
// in the global config file. The filename is a random slugid, and the
// absolute path of the file is returned.
func (ac *ArtifactContent) Download(task *TaskRun) (file string, sha256 string, err error) {
	basename := slugid.Nice()
	file = filepath.Join(config.DownloadsDir, basename)
	var signedURL *url.URL
	signedURL, err = queue.GetLatestArtifact_SignedURL(ac.TaskID, ac.Artifact, time.Minute*30)
	if err != nil {
		return
	}
	sha256, err = downloadURLToFile(signedURL.String(), ac.String(), file, task)
	return
}

func (ac *ArtifactContent) String() string {
	return "task " + ac.TaskID + " artifact " + ac.Artifact
}

func (ac *ArtifactContent) UniqueKey() string {
	return "artifact:" + ac.TaskID + ":" + ac.Artifact
}

func (ac *ArtifactContent) RequiredSHA256() string {
	return ac.Sha256
}

func (ac *ArtifactContent) TaskDependencies() []string {
	return []string{ac.TaskID}
}

// Downloads URLContent to a file inside the caches directory specified in the
// global config file.  The filename is a random slugid, and the absolute path
// of the file is returned.
func (uc *URLContent) Download(task *TaskRun) (file string, sha256 string, err error) {
	basename := slugid.Nice()
	file = filepath.Join(config.DownloadsDir, basename)
	sha256, err = downloadURLToFile(uc.URL, uc.String(), file, task)
	return
}

func (uc *URLContent) String() string {
	return "url " + uc.URL
}

func (uc *URLContent) UniqueKey() string {
	return "urlcontent:" + uc.URL
}

func (uc *URLContent) RequiredSHA256() string {
	return uc.Sha256
}

func (uc *URLContent) TaskDependencies() []string {
	return []string{}
}

// Utility function to aggressively download a url to a file location
func downloadURLToFile(url, contentSource, file string, task *TaskRun) (sha256 string, err error) {
	var contentSize int64
	// httpbackoff.Get(url) is not sufficient as that only guarantees we have
	// an http response to read from, but does not retry if we lose
	// connectivity while reading from it. Therefore include the reading of the
	// response body inside the retry function.
	retryFunc := func() (resp *http.Response, tempError error, permError error) {
		task.Infof("[mounts] Downloading %v to %v", contentSource, file)
		resp, err := http.Get(url)
		// assume all errors should result in a retry
		if err != nil {
			task.Warnf("[mounts] Download of %v failed on this attempt: %v", contentSource, err)
			// temporary error!
			return resp, err, nil
		}
		defer resp.Body.Close()
		f, err := os.OpenFile(file, os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0600)
		if err != nil {
			task.Errorf("[mounts] Could not open file %v: %v", file, err)
			// permanent error!
			return resp, nil, err
		}
		defer f.Close()
		contentSize, err = io.Copy(f, resp.Body)
		if err != nil {
			task.Warnf("[mounts] Could not write http response from %v to file %v on this attempt: %v", contentSource, file, err)
			// likely a temporary error - network blip
			return resp, err, nil
		}
		return resp, nil, nil
	}
	_, _, err = httpbackoff.Retry(retryFunc)
	if err != nil {
		task.Errorf("[mounts] Could not fetch from %v into file %v: %v", contentSource, file, err)
		return
	}
	sha256, err = fileutil.CalculateSHA256(file)
	if err != nil {
		task.Infof("[mounts] Downloaded %v bytes from %v to %v but cannot calculate SHA256", contentSize, contentSource, file)
		panic(fmt.Sprintf("Internal worker bug! Cannot calculate SHA256 of file %v that I just downloaded: %v", file, err))
	}
	task.Infof("[mounts] Downloaded %v bytes with SHA256 %v from %v to %v", contentSize, sha256, contentSource, file)
	return
}

//RawContent to file
func (rc *RawContent) Download(task *TaskRun) (file string, sha256 string, err error) {
	basename := slugid.Nice()
	file = filepath.Join(config.DownloadsDir, basename)
	sha256 = ""
	err = writeStringtoFile(rc.Raw, rc.String(), file, task)
	return
}

func (rc *RawContent) String() string {
	return "Raw (" + rc.Raw + ")"
}

func (rc *RawContent) UniqueKey() string {
	return "Raw content: " + rc.Raw
}

func (rc *RawContent) RequiredSHA256() string {
	return ""
}

func (rc *RawContent) TaskDependencies() []string {
	return []string{}
}

//Base64Content to file
func (bc *Base64Content) Download(task *TaskRun) (file string, sha256 string, err error) {
	basename := slugid.Nice()
	file = filepath.Join(config.DownloadsDir, basename)
	sha256 = ""
	err = writeStringtoFile(bc.Base64, bc.String(), file, task)
	return
}

func (bc *Base64Content) String() string {
	return "Base64 (" + bc.Base64 + ")"
}

func (bc *Base64Content) UniqueKey() string {
	return "Base64 content: " + bc.Base64
}

func (bc *Base64Content) RequiredSHA256() string {
	return ""
}

func (bc *Base64Content) TaskDependencies() []string {
	return []string{}
}

//Copying String to File
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
	purgeRequests, err := pc.PurgeRequests(config.ProvisionerID, config.WorkerType, since)
	if err != nil {
		return err
	}
	// Loop through results, and purge caches when we find an entry. Note,
	// again to account for clock drift, let's remove caches up to 5 minutes
	// older than the given "before" date.
	for _, request := range purgeRequests.Requests {
		if cache, exists := directoryCaches[request.CacheName]; exists {
			if cache.Created.Add(-5 * time.Minute).Before(time.Time(request.Before)) {
				err := cache.Expunge(taskMount.task)
				if err != nil {
					panic(err)
				}
			}
		}
	}
	return nil
}
