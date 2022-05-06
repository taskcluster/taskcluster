//go:generate go run ./gw-codegen file://schemas/docker_posix.yml       generated_docker_linux.go        docker
//go:generate go run ./gw-codegen file://schemas/docker_posix.yml       generated_docker_darwin.go       docker
//go:generate go run ./gw-codegen file://schemas/simple_posix.yml       generated_simple_linux.go        simple
//go:generate go run ./gw-codegen file://schemas/simple_posix.yml       generated_simple_darwin.go       simple
//go:generate go run ./gw-codegen file://schemas/simple_posix.yml       generated_simple_freebsd.go      simple
//go:generate go run ./gw-codegen file://schemas/multiuser_posix.yml    generated_multiuser_darwin.go    multiuser
//go:generate go run ./gw-codegen file://schemas/multiuser_posix.yml    generated_multiuser_linux.go     multiuser
//go:generate go run ./gw-codegen file://schemas/multiuser_windows.yml  generated_multiuser_windows.go   multiuser
// //go:generate go run ./gw-codegen file://../docker-worker/schemas/v1/payload.yml dockerworker/payload.go

package main

import (
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"runtime/debug"
	"strconv"
	"strings"
	"time"

	docopt "github.com/docopt/docopt-go"
	sysinfo "github.com/elastic/go-sysinfo"
	tcclient "github.com/taskcluster/taskcluster/v44/clients/client-go"
	"github.com/taskcluster/taskcluster/v44/clients/client-go/tcqueue"
	"github.com/taskcluster/taskcluster/v44/internal"
	"github.com/taskcluster/taskcluster/v44/internal/mocktc/tc"
	"github.com/taskcluster/taskcluster/v44/internal/scopes"
	"github.com/taskcluster/taskcluster/v44/workers/generic-worker/errorreport"
	"github.com/taskcluster/taskcluster/v44/workers/generic-worker/expose"
	"github.com/taskcluster/taskcluster/v44/workers/generic-worker/fileutil"
	"github.com/taskcluster/taskcluster/v44/workers/generic-worker/graceful"
	"github.com/taskcluster/taskcluster/v44/workers/generic-worker/gwconfig"
	"github.com/taskcluster/taskcluster/v44/workers/generic-worker/host"
	"github.com/taskcluster/taskcluster/v44/workers/generic-worker/process"
	gwruntime "github.com/taskcluster/taskcluster/v44/workers/generic-worker/runtime"
	"github.com/xeipuuv/gojsonschema"
)

var (
	// a horrible simple hack for testing reclaims
	reclaimEvery5Seconds = false
	// Current working directory of process
	cwd = CwdOrPanic()
	// workerReady becomes true when it is able to call queue.claimWork for the first time
	workerReady = false
	// General platform independent user settings, such as home directory, username...
	// Platform specific data should be managed in plat_<platform>.go files
	taskContext    = &TaskContext{}
	config         *gwconfig.Config
	serviceFactory tc.ServiceFactory
	configFile     *gwconfig.File
	Features       []Feature

	logName   = "public/logs/live_backing.log"
	logPath   = filepath.Join("generic-worker", "live_backing.log")
	debugInfo map[string]string

	version  = internal.Version
	revision = "" // this is set during build with `-ldflags "-X main.revision=$(git rev-parse HEAD)"`
)

func persistFeaturesState() (err error) {
	for _, feature := range Features {
		err := feature.PersistState()
		if err != nil {
			return err
		}
	}
	return nil
}

func initialiseFeatures() (err error) {
	Features = []Feature{
		&LiveLogFeature{},
		&TaskclusterProxyFeature{},
		&OSGroupsFeature{},
		&MountsFeature{},
	}
	Features = append(Features, platformFeatures()...)
	for _, feature := range Features {
		log.Printf("Initialising task feature %v...", feature.Name())
		err := feature.Initialise()
		if err != nil {
			log.Printf("FATAL: Initialisation of task feature %v failed!", feature.Name())
			return err
		}
	}
	log.Print("All features initialised.")
	return nil
}

func init() {
	InitialiseLogger()
}

// Entry point into the generic worker...
func main() {
	versionName := "generic-worker (" + engine + " engine) " + version
	if revision != "" {
		versionName += " [ revision: https://github.com/taskcluster/taskcluster/commits/" + revision + " ]"
	}
	arguments, err := docopt.ParseArgs(usage(versionName), nil, versionName)
	if err != nil {
		log.Println("Error parsing command line arguments!")
		panic(err)
	}

	switch {
	case arguments["show-payload-schema"]:
		fmt.Println(taskPayloadSchema())

	case arguments["run"]:
		withWorkerRunner := arguments["--with-worker-runner"].(bool)
		if withWorkerRunner {
			// redirect stdio to the protocol pipe, if given; eventually this will
			// include worker-runner protocol traffic, but for the moment it simply
			// provides a way to channel generic-worker logging to worker-runner
			if protocolPipe, ok := arguments["--worker-runner-protocol-pipe"].(string); ok && protocolPipe != "" {
				f, err := os.OpenFile(protocolPipe, os.O_RDWR, 0)
				exitOnError(CANT_CONNECT_PROTOCOL_PIPE, err, "Cannot connect to %s: %s", protocolPipe, err)

				os.Stdin = f
				os.Stdout = f
				os.Stderr = f
			}
		}

		serviceFactory = &tc.ClientFactory{}
		initializeWorkerRunnerProtocol(os.Stdin, os.Stdout, withWorkerRunner)

		configFileAbs, err := filepath.Abs(arguments["--config"].(string))
		exitOnError(CANT_LOAD_CONFIG, err, "Cannot determine absolute path location for generic-worker config file '%v'", arguments["--config"])

		configFile = &gwconfig.File{
			Path: configFileAbs,
		}
		err = loadConfig(configFile)
		exitOnError(CANT_LOAD_CONFIG, err, "Error loading configuration")

		// Config known to be loaded successfully at this point...

		// * If running tasks as dedicated OS users, we should take ownership
		//   of generic-worker config file, and block access to task users, so
		//   that tasks can't read from or write to it.
		// * If running tasks under the same user account as the generic-worker
		//   process, then we can't avoid that tasks can read the config file,
		//   we can just hope that the config file is at least not writable by
		//   the current user. In this case we won't change file permissions.
		secure(configFile.Path)

		exitCode := RunWorker()
		log.Printf("Exiting worker with exit code %v", exitCode)
		switch exitCode {
		case REBOOT_REQUIRED:
			logEvent("instanceReboot", nil, time.Now())
			if !config.DisableReboots {
				host.ImmediateReboot()
			}
		case IDLE_TIMEOUT:
			logEvent("instanceShutdown", nil, time.Now())
			if config.ShutdownMachineOnIdle {
				host.ImmediateShutdown("generic-worker idle timeout")
			}
		case INTERNAL_ERROR:
			logEvent("instanceShutdown", nil, time.Now())
			if config.ShutdownMachineOnInternalError {
				host.ImmediateShutdown("generic-worker internal error")
			}
		case NONCURRENT_DEPLOYMENT_ID:
			logEvent("instanceShutdown", nil, time.Now())
			host.ImmediateShutdown("generic-worker deploymentId is not latest")
		}
		os.Exit(int(exitCode))
	case arguments["install"]:
		// platform specific...
		err := install(arguments)
		exitOnError(CANT_INSTALL_GENERIC_WORKER, err, "Error installing generic worker")
	case arguments["new-ed25519-keypair"]:
		err := generateEd25519Keypair(arguments["--file"].(string))
		exitOnError(CANT_CREATE_ED25519_KEYPAIR, err, "Error generating ed25519 keypair %v for worker", arguments["--file"].(string))
	default:
		// platform specific...
		os.Exit(int(platformTargets(arguments)))
	}
}

func loadConfig(configFile *gwconfig.File) error {
	var err error

	// first assign defaults

	// TODO: would be better to have a json schema, and also define defaults in
	// only one place if possible (defaults also declared in `usage`)
	config = &gwconfig.Config{
		PublicConfig: gwconfig.PublicConfig{
			CachesDir:                      "caches",
			CheckForNewDeploymentEverySecs: 1800,
			CleanUpTaskDirs:                true,
			DisableReboots:                 false,
			DownloadsDir:                   "downloads",
			IdleTimeoutSecs:                0,
			LiveLogExecutable:              "livelog",
			LiveLogPortBase:                60098,
			NumberOfTasksToRun:             0,
			ProvisionerID:                  "test-provisioner",
			RequiredDiskSpaceMegabytes:     10240,
			RootURL:                        "",
			RunAfterUserCreation:           "",
			SentryProject:                  "generic-worker",
			ShutdownMachineOnIdle:          false,
			ShutdownMachineOnInternalError: false,
			TaskclusterProxyExecutable:     "taskcluster-proxy",
			TaskclusterProxyPort:           80,
			TasksDir:                       defaultTasksDir(),
			WorkerGroup:                    "test-worker-group",
			WorkerLocation:                 "",
			WorkerTypeMetadata:             map[string]interface{}{},
		},
	}

	// apply values from config file
	err = configFile.UpdateConfig(config)
	if err != nil {
		return err
	}

	// Add useful worker config to worker metadata
	config.WorkerTypeMetadata["config"] = map[string]interface{}{
		"deploymentId": config.DeploymentID,
	}
	gwMetadata := map[string]interface{}{
		"go-arch":    runtime.GOARCH,
		"go-os":      runtime.GOOS,
		"go-version": runtime.Version(),
		"release":    "https://github.com/taskcluster/taskcluster/releases/tag/v" + version,
		"version":    version,
		"engine":     engine,
	}
	if revision != "" {
		gwMetadata["revision"] = revision
		gwMetadata["source"] = "https://github.com/taskcluster/taskcluster/commits/" + revision
	}
	config.WorkerTypeMetadata["generic-worker"] = gwMetadata
	debugInfo = map[string]string{
		"GOARCH":          runtime.GOARCH,
		"GOOS":            runtime.GOOS,
		"cleanUpTaskDirs": strconv.FormatBool(config.CleanUpTaskDirs),
		"deploymentId":    config.DeploymentID,
		"engine":          engine,
		"gwRevision":      revision,
		"gwVersion":       version,
		"instanceType":    config.InstanceType,
		"provisionerId":   config.ProvisionerID,
		"rootURL":         config.RootURL,
		"workerGroup":     config.WorkerGroup,
		"workerId":        config.WorkerID,
		"workerType":      config.WorkerType,
	}
	return nil
}

var exposer expose.Exposer

func setupExposer() (err error) {
	if config.WSTAudience != "" && config.WSTServerURL != "" {
		authClientFactory := func() tc.Auth {
			return serviceFactory.Auth(config.Credentials(), config.RootURL)
		}
		exposer, err = expose.NewWST(
			config.WSTServerURL,
			config.WSTAudience,
			config.WorkerGroup,
			config.WorkerID,
			authClientFactory,
		)
	} else {
		exposer, err = expose.NewLocal(config.PublicIP)
	}
	return err
}

func ReadTasksResolvedFile() uint {
	b, err := ioutil.ReadFile("tasks-resolved-count.txt")
	if err != nil {
		log.Printf("could not open tasks-resolved-count.txt: %s (ignored)", err)
		return 0
	}
	i, err := strconv.Atoi(string(b))
	if err != nil {
		// treat an invalid (usually empty) file as nonexistent
		log.Printf("could not parse content of tasks-resolved-count.txt: %s (ignored)", err)
		return 0
	}
	return uint(i)
}

// Also called from tests, so avoid panic in this function since this could
// cause tests to silently pass - instead require error handling.
func UpdateTasksResolvedFile(t uint) error {
	err := ioutil.WriteFile("tasks-resolved-count.txt", []byte(strconv.Itoa(int(t))), 0777)
	if err != nil {
		return err
	}
	return fileutil.SecureFiles("tasks-resolved-count.txt")
}

// HandleCrash reports a crash in worker logs and reports the crash to sentry
// if it has valid credentials and a valid sentry project. The argument r is
// the object returned by the recover call, thrown by the panic call that
// caused the worker crash.
func HandleCrash(r interface{}) {
	log.Print(string(debug.Stack()))
	log.Print(" *********** PANIC occurred! *********** ")
	log.Printf("%v", r)
	if WorkerRunnerProtocol != nil {
		errorreport.Send(WorkerRunnerProtocol, r, debugInfo)
	}
	ReportCrashToSentry(r)
}

// We need this at package initialisation for tests, so no choice but to panic
// if we can't fetch it - so no reporting to sentry
func CwdOrPanic() string {
	cwd, err := os.Getwd()
	if err != nil {
		panic(err)
	}
	return cwd
}

func RunWorker() (exitCode ExitCode) {
	defer func() {
		if r := recover(); r != nil {
			HandleCrash(r)
			exitCode = INTERNAL_ERROR
		}
	}()

	err := config.Validate()
	if err != nil {
		log.Printf("Invalid config: %v", err)
		return INVALID_CONFIG
	}

	// This *DOESN'T* output secret fields, so is SAFE
	log.Printf("Config: %v", config)
	log.Printf("Detected %s platform", runtime.GOOS)
	log.Printf("Detected %s engine", engine)
	if host, err := sysinfo.Host(); err == nil {
		logEvent("instanceBoot", nil, host.Info().BootTime)
	}

	err = setupExposer()
	if err != nil {
		log.Printf("Could not initialize exposer: %v", err)
		return INTERNAL_ERROR
	}

	// number of tasks resolved since worker first ran
	// stored in a json file, since we may reboot between tasks etc
	tasksResolved := ReadTasksResolvedFile()
	// use a pointer to the value, to make sure it is resolved at defer-time, not now
	defer func(t *uint) {
		err := UpdateTasksResolvedFile(*t)
		if err != nil {
			panic(err)
		}
	}(&tasksResolved)

	err = initialiseFeatures()
	if err != nil {
		panic(err)
	}
	defer func() {
		err := persistFeaturesState()
		if err != nil {
			log.Printf("Could not persist features: %v", err)
			exitCode = INTERNAL_ERROR
		}
	}()

	// loop, claiming and running tasks!
	lastActive := time.Now()
	// use zero value, to be sure that a check is made before first task runs
	lastCheckedDeploymentID := time.Time{}
	lastReportedNoTasks := time.Now()
	sigInterrupt := make(chan os.Signal, 1)
	signal.Notify(sigInterrupt, os.Interrupt)
	if RotateTaskEnvironment() {
		return REBOOT_REQUIRED
	}
	for {

		// See https://bugzil.la/1298010 - routinely check if this worker type is
		// outdated, and shut down if a new deployment is required.
		// Round(0) forces wall time calculation instead of monotonic time in case machine slept etc
		if time.Now().Round(0).Sub(lastCheckedDeploymentID) > time.Duration(config.CheckForNewDeploymentEverySecs)*time.Second {
			lastCheckedDeploymentID = time.Now()
			if deploymentIDUpdated() {
				return NONCURRENT_DEPLOYMENT_ID
			}
		}

		// Ensure there is enough disk space *before* claiming a task
		err := garbageCollection()
		if err != nil {
			panic(err)
		}

		task := ClaimWork()

		// make sure at least 5 seconds pass between tcqueue.ClaimWork API calls
		wait5Seconds := time.NewTimer(time.Second * 5)

		if task != nil {
			logEvent("taskQueued", task, time.Time(task.Definition.Created))
			logEvent("taskStart", task, time.Now())

			errors := task.Run()

			logEvent("taskFinish", task, time.Now())
			if errors.Occurred() {
				log.Printf("ERROR(s) encountered: %v", errors)
				task.Error(errors.Error())
			}
			if errors.WorkerShutdown() {
				return WORKER_SHUTDOWN
			}
			err := task.ReleaseResources()
			if err != nil {
				log.Printf("ERROR: releasing resources\n%v", err)
			}
			err = purgeOldTasks()
			if err != nil {
				panic(err)
			}
			tasksResolved++
			// remainingTasks will be -ve, if config.NumberOfTasksToRun is not set (=0)
			remainingTasks := int(config.NumberOfTasksToRun - tasksResolved)
			remainingTaskCountText := ""
			if remainingTasks > 0 {
				remainingTaskCountText = fmt.Sprintf(" (will exit after resolving %v more)", remainingTasks)
			}
			log.Printf("Resolved %v tasks in total so far%v.", tasksResolved, remainingTaskCountText)
			if remainingTasks == 0 {
				log.Printf("Completed all task(s) (number of tasks to run = %v)", config.NumberOfTasksToRun)
				if deploymentIDUpdated() {
					return NONCURRENT_DEPLOYMENT_ID
				}
				return TASKS_COMPLETE
			}
			if rebootBetweenTasks() {
				return REBOOT_REQUIRED
			}
			lastActive = time.Now()
			if RotateTaskEnvironment() {
				return REBOOT_REQUIRED
			}
		} else {
			// Round(0) forces wall time calculation instead of monotonic time in case machine slept etc
			idleTime := time.Now().Round(0).Sub(lastActive)
			remainingIdleTimeText := ""
			if config.IdleTimeoutSecs > 0 {
				remainingIdleTimeText = fmt.Sprintf(" (will exit if no task claimed in %v)", time.Second*time.Duration(config.IdleTimeoutSecs)-idleTime)
				if idleTime.Seconds() > float64(config.IdleTimeoutSecs) {
					_ = purgeOldTasks()
					log.Printf("Worker idle for idleShutdownTimeoutSecs seconds (%v)", idleTime)
					return IDLE_TIMEOUT
				}
			}
			// Let's not be over-verbose in logs - has cost implications,
			// so report only once per minute that no task was claimed, not every second.
			// Round(0) forces wall time calculation instead of monotonic time in case machine slept etc
			if time.Now().Round(0).Sub(lastReportedNoTasks) > 1*time.Minute {
				lastReportedNoTasks = time.Now()
				// remainingTasks will be -ve, if config.NumberOfTasksToRun is not set (=0)
				remainingTaskCountText := ""
				if config.NumberOfTasksToRun > 0 {
					if remainingTasks := int(config.NumberOfTasksToRun - tasksResolved); remainingTasks >= 0 {
						remainingTaskCountText = fmt.Sprintf(" %v more tasks to run before exiting.", remainingTasks)
					}
				}
				log.Printf("No task claimed. Idle for %v%v.%v", idleTime, remainingIdleTimeText, remainingTaskCountText)
			}
		}

		if graceful.TerminationRequested() {
			return WORKER_SHUTDOWN
		}

		// To avoid hammering queue, make sure there is at least 5 seconds
		// between consecutive requests. Note we do this even if a task ran,
		// since a task could complete in less than that amount of time.
		select {
		case <-wait5Seconds.C:
		case <-sigInterrupt:
			return WORKER_STOPPED
		}
	}
}

func deploymentIDUpdated() bool {
	latestDeploymentID, err := configFile.NewestDeploymentID()
	switch {
	case err != nil:
		log.Printf("%v", err)
	case latestDeploymentID == config.DeploymentID:
		log.Printf("No change to deploymentId - %q == %q", config.DeploymentID, latestDeploymentID)
	default:
		log.Printf("New deploymentId found! %q => %q - therefore shutting down!", config.DeploymentID, latestDeploymentID)
		return true
	}
	return false
}

// ClaimWork queries the Queue to find a task.
func ClaimWork() *TaskRun {
	// only log workerReady the first time queue.claimWork is called
	if !workerReady {
		workerReady = true
		logEvent("workerReady", nil, time.Now())
	}
	req := &tcqueue.ClaimWorkRequest{
		Tasks:       1,
		WorkerGroup: config.WorkerGroup,
		WorkerID:    config.WorkerID,
	}

	// Store local clock time when claiming, rather than queue's claim time, to
	// avoid problems with clock skew.
	localClaimTime := time.Now()
	queue := serviceFactory.Queue(config.Credentials(), config.RootURL)
	resp, err := queue.ClaimWork(fmt.Sprintf("%s/%s", config.ProvisionerID, config.WorkerType), req)
	if err != nil {
		log.Printf("Could not claim work. %v", err)
		return nil
	}
	switch {

	// no tasks - nothing to return
	case len(resp.Tasks) < 1:
		return nil

	// more than one task - BUG!
	case len(resp.Tasks) > 1:
		panic(fmt.Sprintf("SERIOUS BUG: too many tasks returned from queue - only 1 requested, but %v returned", len(resp.Tasks)))

	// exactly one task - process it!
	default:
		log.Print("Task found")
		taskResponse := resp.Tasks[0]
		taskQueue := serviceFactory.Queue(
			&tcclient.Credentials{
				ClientID:    taskResponse.Credentials.ClientID,
				AccessToken: taskResponse.Credentials.AccessToken,
				Certificate: taskResponse.Credentials.Certificate,
			},
			config.RootURL,
		)
		task := &TaskRun{
			TaskID:            taskResponse.Status.TaskID,
			RunID:             uint(taskResponse.RunID),
			Status:            claimed,
			Definition:        taskResponse.Task,
			Queue:             taskQueue,
			TaskClaimResponse: tcqueue.TaskClaimResponse(taskResponse),
			Artifacts:         map[string]TaskArtifact{},
			featureArtifacts: map[string]string{
				logName: "Native Log",
			},
			LocalClaimTime: localClaimTime,
		}
		task.StatusManager = NewTaskStatusManager(task)
		return task
	}
}

func (task *TaskRun) validatePayload() *CommandExecutionError {
	jsonPayload := task.Definition.Payload
	schemaLoader := gojsonschema.NewStringLoader(taskPayloadSchema())
	docLoader := gojsonschema.NewStringLoader(string(jsonPayload))
	result, err := gojsonschema.Validate(schemaLoader, docLoader)
	if err != nil {
		return MalformedPayloadError(err)
	}
	if !result.Valid() {
		task.Errorf("Task payload for this worker type must conform to the following jsonschema:\n%s", taskPayloadSchema())
		task.Error("TASK FAIL since the task payload is invalid. See errors:")
		for _, desc := range result.Errors() {
			task.Errorf("- %s", desc)
		}
		// Dealing with Invalid Task Payloads
		// ----------------------------------
		// If the task payload is malformed or invalid, keep in mind that the
		// queue doesn't validate the contents of the `task.payload` property,
		// the worker may resolve the current run by reporting an exception.
		// When reporting an exception, using `tcqueue.ReportException` the
		// worker should give a `reason`. If the worker is unable execute the
		// task specific payload/code/logic, it should report exception with
		// the reason `malformed-payload`.
		//
		// This can also be used if an external resource that is referenced in
		// a declarative nature doesn't exist. Generally, it should be used if
		// we can be certain that another run of the task will have the same
		// result. This differs from `tcqueue.ReportFailed` in the sense that we
		// report a failure if the task specific code failed.
		//
		// Most tasks includes a lot of declarative steps, such as poll a
		// docker image, create cache folder, decrypt encrypted environment
		// variables, set environment variables and etc. Clearly, if decryption
		// of environment variables fail, there is no reason to retry the task.
		// Nor can it be said that the task failed, because the error wasn't
		// cause by execution of Turing complete code.
		//
		// If however, we run some executable code referenced in `task.payload`
		// and the code crashes or exists non-zero, then the task is said to be
		// failed. The difference is whether or not the unexpected behavior
		// happened before or after the execution of task specific Turing
		// complete code.
		return MalformedPayloadError(fmt.Errorf("Validation of payload failed for task %v", task.TaskID))
	}
	err = json.Unmarshal(jsonPayload, &task.Payload)
	if err != nil {
		return MalformedPayloadError(err)
	}
	for _, artifact := range task.Payload.Artifacts {
		// The default artifact expiry is task expiry, but is only applied when
		// the task artifacts are resolved. We intentionally don't modify
		// task.Payload otherwise it no longer reflects the real data defined
		// in the task.
		if !time.Time(artifact.Expires).IsZero() {
			// Don't be too strict: allow 1s discrepancy to account for
			// possible timestamp rounding on upstream systems
			if time.Time(artifact.Expires).Add(time.Second).Before(time.Time(task.Definition.Deadline)) {
				return MalformedPayloadError(fmt.Errorf("Malformed payload: artifact '%v' expires before task deadline (%v is before %v)", artifact.Path, artifact.Expires, task.Definition.Deadline))
			}
			// Don't be too strict: allow 1s discrepancy to account for
			// possible timestamp rounding on upstream systems
			if time.Time(artifact.Expires).After(time.Time(task.Definition.Expires).Add(time.Second)) {
				return MalformedPayloadError(fmt.Errorf("Malformed payload: artifact '%v' expires after task expiry (%v is after %v)", artifact.Path, artifact.Expires, task.Definition.Expires))
			}
		}
	}
	return nil
}

type CommandExecutionError struct {
	TaskStatus TaskStatus
	Cause      error
	Reason     TaskUpdateReason
}

func executionError(reason TaskUpdateReason, status TaskStatus, err error) *CommandExecutionError {
	if err == nil {
		return nil
	}
	return &CommandExecutionError{
		Cause:      err,
		Reason:     reason,
		TaskStatus: status,
	}
}

func ResourceUnavailable(err error) *CommandExecutionError {
	return executionError(resourceUnavailable, errored, err)
}

func MalformedPayloadError(err error) *CommandExecutionError {
	return executionError(malformedPayload, errored, err)
}

func Failure(err error) *CommandExecutionError {
	return executionError("", failed, err)
}

func (task *TaskRun) Infof(format string, v ...interface{}) {
	task.Info(fmt.Sprintf(format, v...))
}

func (task *TaskRun) Warnf(format string, v ...interface{}) {
	task.Warn(fmt.Sprintf(format, v...))
}

func (task *TaskRun) Errorf(format string, v ...interface{}) {
	task.Error(fmt.Sprintf(format, v...))
}

func (task *TaskRun) Info(message string) {
	now := tcclient.Time(time.Now()).String()
	task.Log("[taskcluster "+now+"] ", message)
}

func (task *TaskRun) Warn(message string) {
	now := tcclient.Time(time.Now()).String()
	task.Log("[taskcluster:warn "+now+"] ", message)
}

func (task *TaskRun) Error(message string) {
	task.Log("[taskcluster:error] ", message)
}

// Log lines like:
//  [taskcluster 2017-01-25T23:31:13.787Z] Hey, hey, we're The Monkees.
func (task *TaskRun) Log(prefix, message string) {
	task.logMux.Lock()
	defer task.logMux.Unlock()
	if task.logWriter != nil {
		for _, line := range strings.Split(message, "\n") {
			_, _ = task.logWriter.Write([]byte(prefix + line + "\n"))
		}
	} else {
		log.Print("Unloggable task log message (no task log writer): " + message)
	}
}

func (err *CommandExecutionError) Error() string {
	return fmt.Sprintf("%v", err.Cause)
}

func (task *TaskRun) IsIntermittentExitCode(c int64) bool {
	for _, code := range task.Payload.OnExitStatus.Retry {
		if c == code {
			return true
		}
	}
	return false
}

func (task *TaskRun) ExecuteCommand(index int) *CommandExecutionError {
	task.Infof("Executing command %v: %v", index, task.formatCommand(index))
	log.Print("Executing command " + strconv.Itoa(index) + ": " + task.Commands[index].String())
	cee := task.prepareCommand(index)
	if cee != nil {
		panic(cee)
	}
	result := task.Commands[index].Execute()
	if ae := task.StatusManager.AbortException(); ae != nil {
		return ae
	}
	task.Infof("%v", result)

	switch {
	case result.Failed():
		if task.IsIntermittentExitCode(int64(result.ExitCode())) {
			return &CommandExecutionError{
				Cause:      fmt.Errorf("Task appears to have failed intermittently - exit code %v found in task payload.onExitStatus list", result.ExitCode()),
				Reason:     intermittentTask,
				TaskStatus: errored,
			}
		} else {
			return &CommandExecutionError{
				Cause:      result.FailureCause(),
				TaskStatus: failed,
			}
		}
	case result.Crashed():
		panic(result.CrashCause())
	}
	return nil
}

type ExecutionErrors []*CommandExecutionError

func (e *ExecutionErrors) add(err *CommandExecutionError) {
	if err == nil {
		return
	}
	if e == nil {
		*e = ExecutionErrors{err}
	} else {
		*e = append(*e, err)
	}
}

func (e *ExecutionErrors) Error() string {
	if !e.Occurred() {
		return ""
	}
	return (*e)[0].Error()
}

// WorkerShutdown returns true if any of the accumlated errors is a worker-shutdown
func (e *ExecutionErrors) WorkerShutdown() bool {
	if !e.Occurred() {
		return false
	}
	for _, err := range *e {
		if err.TaskStatus == aborted && err.Reason == workerShutdown {
			return true
		}
	}
	return false
}

func (e *ExecutionErrors) Occurred() bool {
	return len(*e) > 0
}

func (task *TaskRun) resolve(e *ExecutionErrors) *CommandExecutionError {
	log.Printf("Resolving task %v ...", task.TaskID)
	if !e.Occurred() {
		return ResourceUnavailable(task.StatusManager.ReportCompleted())
	}
	if (*e)[0].TaskStatus == failed {
		return ResourceUnavailable(task.StatusManager.ReportFailed())
	}
	return ResourceUnavailable(task.StatusManager.ReportException((*e)[0].Reason))
}

func (task *TaskRun) setMaxRunTimer() *time.Timer {
	return time.AfterFunc(
		time.Second*time.Duration(task.Payload.MaxRunTime),
		func() {
			// ignore any error the Abort function returns - we are in the
			// wrong go routine to properly handle it
			err := task.StatusManager.Abort(Failure(fmt.Errorf("Task aborted - max run time exceeded")))
			if err != nil {
				task.Warnf("Error when aborting task: %v", err)
			}
		},
	)
}

func (task *TaskRun) kill() {
	for _, command := range task.Commands {
		output, err := command.Kill()
		if len(output) > 0 {
			task.Info(string(output))
		}
		if err != nil {
			log.Printf("WARNING: %v", err)
			task.Warnf("%v", err)
		}
	}
}

func (task *TaskRun) createLogFile() *os.File {
	absLogFile := filepath.Join(taskContext.TaskDir, logPath)
	logFileHandle, err := os.Create(absLogFile)
	if err != nil {
		panic(err)
	}
	task.logMux.Lock()
	defer task.logMux.Unlock()
	task.logWriter = logFileHandle
	return logFileHandle
}

func (task *TaskRun) logHeader() {
	jsonBytes, err := json.MarshalIndent(config.WorkerTypeMetadata, "  ", "  ")
	if err != nil {
		panic(err)
	}
	task.Infof("Worker Type (%v/%v) settings:", config.ProvisionerID, config.WorkerType)
	task.Info("  " + string(jsonBytes))
	task.Info("Task ID: " + task.TaskID)
	task.Info("=== Task Starting ===")
}

func (task *TaskRun) Run() (err *ExecutionErrors) {

	// err is essentially a list of all errors that occur. We'll base the task
	// resolution on the first error that occurs. The err.add(<error-or-nil>)
	// function is a simple way of adding an error to the list, if one occurs,
	// otherwise not adding it, if it is nil

	// note, since we return the value pointed to by `err`, we can continue
	// to manipulate `err` even in defer statements, and this will affect
	// return value of this method.

	err = &ExecutionErrors{}

	defer func() {
		if r := recover(); r != nil {
			err.add(executionError(internalError, errored, fmt.Errorf("%#v", r)))
			defer panic(r)
		}
		err.add(task.resolve(err))
	}()

	logHandle := task.createLogFile()
	defer func() {
		// log any errors that occurred
		if err.Occurred() {
			task.Error(err.Error())
		}
		if r := recover(); r != nil {
			task.Error(string(debug.Stack()))
			task.Errorf("%#v", r)
			task.Errorf("%v", r)
			defer panic(r)
		}
		task.closeLog(logHandle)
		err.add(task.uploadLog(logName, logPath))
	}()

	task.logHeader()

	err.add(task.validatePayload())
	if err.Occurred() {
		return
	}
	log.Printf("Running task %v/tasks/%v/runs/%v", config.RootURL, task.TaskID, task.RunID)

	task.Commands = make([]*process.Command, len(task.Payload.Command))
	// generate commands, in case features want to modify them
	for i := range task.Payload.Command {
		err := task.generateCommand(i) // platform specific
		if err != nil {
			panic(err)
		}
	}

	// tracks which Feature created which TaskFeature
	type TaskFeatureOrigin struct {
		taskFeature TaskFeature
		feature     Feature
	}

	taskFeatureOrigins := []TaskFeatureOrigin{}

	// create task features
	for _, feature := range Features {
		if feature.IsEnabled(task) {
			log.Printf("Creating task feature %v...", feature.Name())
			taskFeature := feature.NewTaskFeature(task)
			requiredScopes := taskFeature.RequiredScopes()
			scopesSatisfied, scopeValidationErr := scopes.Given(task.Definition.Scopes).Satisfies(requiredScopes, serviceFactory.Auth(config.Credentials(), config.RootURL))
			if scopeValidationErr != nil {
				// presumably we couldn't expand assume:* scopes due to auth
				// service unavailability
				err.add(ResourceUnavailable(scopeValidationErr))
				continue
			}
			if !scopesSatisfied {
				err.add(MalformedPayloadError(fmt.Errorf("Feature %q requires scopes:\n\n%v\n\nbut task only has scopes:\n\n%v\n\nYou probably should add some scopes to your task definition", feature.Name(), requiredScopes, scopes.Given(task.Definition.Scopes))))
				continue
			}
			reservedArtifacts := taskFeature.ReservedArtifacts()
			for _, a := range reservedArtifacts {
				if f := task.featureArtifacts[a]; f != "" {
					err.add(MalformedPayloadError(fmt.Errorf("Feature %q wishes to publish artifact %v but feature %v has already reserved this artifact name", feature.Name(), a, f)))
				} else {
					task.featureArtifacts[a] = feature.Name()
				}
			}
			taskFeatureOrigins = append(
				taskFeatureOrigins,
				TaskFeatureOrigin{
					taskFeature: taskFeature,
					feature:     feature,
				},
			)
		}
	}
	if err.Occurred() {
		return
	}

	// start task features
	for _, taskFeatureOrigin := range taskFeatureOrigins {

		log.Printf("Starting task feature %v...", taskFeatureOrigin.feature.Name())
		err.add(taskFeatureOrigin.taskFeature.Start())

		// make sure we defer Stop() even if Start() returns an error, since the feature may have made
		// changes that need cleaning up in Stop() before it hit the error that it returned...
		defer func(taskFeatureOrigin TaskFeatureOrigin) {
			log.Printf("Stopping task feature %v...", taskFeatureOrigin.feature.Name())
			taskFeatureOrigin.taskFeature.Stop(err)
		}(taskFeatureOrigin)

		if err.Occurred() {
			return
		}
	}

	defer func() {
		for _, artifact := range task.PayloadArtifacts() {
			// Any attempt to upload a feature artifact should be skipped
			// but not cause a failure, since e.g. a directory artifact
			// could include one, non-maliciously, such as a top level
			// public/ directory artifact that includes
			// public/logs/live_backing.log inadvertently.
			if feature := task.featureArtifacts[artifact.Base().Name]; feature != "" {
				task.Warnf("Not uploading artifact %v found in task.payload.artifacts section, since this will be uploaded later by %v", artifact.Base().Name, feature)
				continue
			}
			err.add(task.uploadArtifact(artifact))
			// Note - the above error only covers not being able to upload an
			// artifact, but doesn't cover case that an artifact could not be
			// found, and so an error artifact was uploaded. So we do that
			// here:
			switch a := artifact.(type) {
			case *ErrorArtifact:
				fail := Failure(fmt.Errorf("%v: %v", a.Reason, a.Message))
				err.add(fail)
				task.Errorf("TASK FAILURE during artifact upload: %v", fail)
			}
		}
	}()

	t := task.setMaxRunTimer()
	defer func() {

		// Bug 1329617
		// ********* DON'T drain channel **********
		// because AfterFunc() drains it!
		// see https://play.golang.org/p/6pqRerGVcg
		// ****************************************
		//
		// if !t.Stop() {
		// <-t.C
		// }
		t.Stop()
	}()

	// Terminating the Worker Early
	// ----------------------------
	// If the worker finds itself having to terminate early, for example a spot
	// nodes that detects pending termination. Or a physical machine ordered to
	// be provisioned for another purpose, the worker should report exception
	// with the reason `worker-shutdown`. Upon such report the queue will
	// resolve the run as exception and create a new run, if the task has
	// additional retries left.
	stopHandlingGracefulTermination := graceful.OnTerminationRequest(func(finishTasks bool) {
		if !finishTasks {
			_ = task.StatusManager.Abort(
				&CommandExecutionError{
					Cause:      fmt.Errorf("graceful termination requested, without time to finish tasks"),
					Reason:     workerShutdown,
					TaskStatus: aborted,
				},
			)
		}
	})
	defer stopHandlingGracefulTermination()

	started := time.Now()
	defer func() {
		finished := time.Now()
		task.Info("=== Task Finished ===")
		// Round(0) forces wall time calculation instead of monotonic time in case machine slept etc
		task.Info("Task Duration: " + finished.Round(0).Sub(started).String())
	}()

	for i := range task.Payload.Command {
		err.add(task.ExecuteCommand(i))
		if err.Occurred() {
			return
		}
	}

	return
}

func loadFromJSONFile(obj interface{}, filename string) (err error) {
	var f *os.File
	f, err = os.Open(filename)
	if err != nil {
		return
	}
	defer func() {
		err2 := f.Close()
		if err == nil {
			err = err2
		}
	}()
	d := json.NewDecoder(f)
	d.DisallowUnknownFields()
	err = d.Decode(obj)
	if err == nil {
		log.Printf("Loaded file %v", filename)
	} else {
		log.Printf("Could not load file %v into object %T - is it json?", filename, obj)
	}
	return
}

func (task *TaskRun) closeLog(logHandle io.WriteCloser) {
	err := logHandle.Close()
	if err != nil {
		panic(err)
	}
}

func PrepareTaskEnvironment() (reboot bool) {
	// I've discovered windows has a limit of 20 chars
	taskDirName := fmt.Sprintf("task_%v", time.Now().UnixNano())[:20]
	if PlatformTaskEnvironmentSetup(taskDirName) {
		return true
	}
	logDir := filepath.Join(taskContext.TaskDir, filepath.Dir(logPath))
	err := os.MkdirAll(logDir, 0700)
	if err != nil {
		panic(err)
	}
	log.Printf("Created dir: %v", logDir)
	return false
}

func taskDirsIn(parentDir string) ([]string, error) {
	taskDirsParent, err := os.Open(parentDir)
	if err != nil {
		return nil, err
	}
	defer taskDirsParent.Close()
	fi, err := taskDirsParent.Readdir(-1)
	if err != nil {
		return nil, err
	}
	directories := []string{}
	for _, file := range fi {
		if file.IsDir() {
			fileName := file.Name()
			if strings.HasPrefix(fileName, "task_") {
				path := filepath.Join(parentDir, fileName)
				directories = append(directories, path)
			}
		}
	}
	return directories, nil
}

func (task *TaskRun) ReleaseResources() error {
	return taskContext.pd.ReleaseResources()
}

type TaskContext struct {
	TaskDir string
	User    *gwruntime.OSUser
	pd      *process.PlatformData
}

// deleteTaskDirs deletes all task directories (directories whose name starts
// with `task_`) inside directory parentDir, except those whose names are in
// skipNames
func deleteTaskDirs(parentDir string, skipNames ...string) {
	taskDirs, err := taskDirsIn(parentDir)
	if err != nil {
		return
	}
outer:
	for _, taskDir := range taskDirs {
		name := filepath.Base(taskDir)
		for _, skip := range skipNames {
			if name == skip {
				continue outer
			}
		}
		err = deleteDir(taskDir)
		if err != nil {
			log.Printf("WARNING: Could not delete task directory %v: %v", taskDir, err)
		}
	}
}

// RotateTaskEnvironment creates a new task environment (for the next task),
// and purges existing used task environments.
func RotateTaskEnvironment() (reboot bool) {
	if PrepareTaskEnvironment() {
		return true
	}
	err := purgeOldTasks()
	// errors are not fatal
	if err != nil {
		log.Printf("WARNING: failed to remove old task directories/users: %v", err)
	}
	return false
}

func exitOnError(exitCode ExitCode, err error, logMessage string, args ...interface{}) {
	if err == nil {
		return
	}
	log.Printf(logMessage, args...)
	log.Printf("Root cause: %v", err)
	log.Printf("%#v (%T)", err, err)
	combinedErr := fmt.Errorf("%s, args: %v, root cause: %v, exit code: %d", logMessage, args, err, exitCode)
	errorreport.Send(WorkerRunnerProtocol, combinedErr, debugInfo)
	os.Exit(int(exitCode))
}
