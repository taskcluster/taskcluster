//go:generate go run ./gw-codegen file://schemas/insecure_posix.yml     generated_insecure_linux.go      insecure
//go:generate go run ./gw-codegen file://schemas/insecure_posix.yml     generated_insecure_darwin.go     insecure
//go:generate go run ./gw-codegen file://schemas/insecure_posix.yml     generated_insecure_freebsd.go    insecure
//go:generate go run ./gw-codegen file://schemas/multiuser_posix.yml    generated_multiuser_darwin.go    multiuser
//go:generate go run ./gw-codegen file://schemas/multiuser_posix.yml    generated_multiuser_linux.go     multiuser
//go:generate go run ./gw-codegen file://schemas/multiuser_posix.yml    generated_multiuser_freebsd.go   multiuser
//go:generate go run ./gw-codegen file://schemas/multiuser_windows.yml  generated_multiuser_windows.go   multiuser
// //go:generate go run ./gw-codegen file://../docker-worker/schemas/v1/payload.yml dockerworker/payload.go

package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"runtime/debug"
	"strconv"
	"strings"
	"time"

	"slices"

	docopt "github.com/docopt/docopt-go"
	sysinfo "github.com/elastic/go-sysinfo"
	"github.com/mcuadros/go-defaults"
	tcclient "github.com/taskcluster/taskcluster/v96/clients/client-go"
	"github.com/taskcluster/taskcluster/v96/clients/client-go/tcqueue"
	"github.com/taskcluster/taskcluster/v96/internal"
	"github.com/taskcluster/taskcluster/v96/internal/mocktc/tc"
	"github.com/taskcluster/taskcluster/v96/internal/scopes"
	"github.com/taskcluster/taskcluster/v96/tools/workerproto"
	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/artifacts"
	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/errorreport"
	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/expose"
	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/fileutil"
	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/graceful"
	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/gwconfig"
	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/host"
	"github.com/taskcluster/taskcluster/v96/workers/generic-worker/process"
	gwruntime "github.com/taskcluster/taskcluster/v96/workers/generic-worker/runtime"
	"github.com/xeipuuv/gojsonschema"
)

var (
	withWorkerRunner = false
	// a horrible simple hack for testing reclaims
	reclaimEvery5Seconds = false
	// Current working directory of process
	cwd = CwdOrPanic()
	// Tasks resolved count file
	trcPath = filepath.Join(cwd, "tasks-resolved-count.txt")
	// workerReady becomes true when it is able to call queue.claimWork for the first time
	workerReady = false
	// General platform independent user settings, such as home directory, username...
	// Platform specific data should be managed in plat_<platform>.go files
	taskContext    = &TaskContext{}
	config         *gwconfig.Config
	serviceFactory tc.ServiceFactory
	configFile     *gwconfig.File
	features       []Feature

	logPath   = filepath.Join("generic-worker", "live_backing.log")
	debugInfo map[string]string

	version          = internal.Version
	revision         = "" // this is set during build with `-ldflags "-X main.revision=$(git rev-parse HEAD)"`
	workerStatusPath = filepath.Join(os.TempDir(), "worker-status.json")
)

func initialiseFeatures() (err error) {
	features = []Feature{
		&AbortFeature{},
		&BackingLogFeature{},
		&PayloadValidatorFeature{},
		&CommandGeneratorFeature{},
		&LiveLogFeature{},
		&TaskclusterProxyFeature{},
		&OSGroupsFeature{},
		&MountsFeature{},
		&ResourceMonitorFeature{},
		&InteractiveFeature{},
		&MetadataFeature{},
	}
	features = append(features, platformFeatures()...)
	features = append(
		features,
		&MaxRunTimeFeature{},
		&TaskTimerFeature{},
		&CommandExecutorFeature{},
	)
	for _, feature := range features {
		log.Printf("Initialising feature %v...", feature.Name())
		err := feature.Initialise()
		if err != nil {
			log.Printf("FATAL: Initialisation of feature %v failed!", feature.Name())
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
		fmt.Println(JSONSchema())
	case arguments["--short-version"]:
		fmt.Println(version)
	case arguments["status"]:
		statusBytes, err := os.ReadFile(workerStatusPath)
		if err != nil && !os.IsNotExist(err) {
			exitOnError(CANT_GET_WORKER_STATUS, err, "Error reading worker status file")
		}
		if statusBytes == nil {
			statusBytes, err = json.MarshalIndent(&WorkerStatus{CurrentTaskIDs: []string{}}, "", "  ")
			exitOnError(INTERNAL_ERROR, err, "Error marshalling worker status")
		}
		fmt.Println(string(statusBytes))

	case arguments["run"]:
		withWorkerRunner = arguments["--with-worker-runner"].(bool)
		if withWorkerRunner {
			// redirect stdio to the protocol pipe, if given; eventually this will
			// include worker-runner protocol traffic, but for the moment it simply
			// provides a way to channel generic-worker logging to worker-runner
			if protocolPipe, ok := arguments["--worker-runner-protocol-pipe"].(string); ok && protocolPipe != "" {
				// Connect to input pipe (client->server) for writing
				inputPipeName := protocolPipe + "-input"
				fw, err := os.OpenFile(inputPipeName, os.O_WRONLY, 0)
				exitOnError(CANT_CONNECT_PROTOCOL_PIPE, err, "Cannot connect to input pipe %s: %s", inputPipeName, err)

				// Connect to output pipe (server->client) for reading
				outputPipeName := protocolPipe + "-output"
				fr, err := os.OpenFile(outputPipeName, os.O_RDONLY, 0)
				exitOnError(CANT_CONNECT_PROTOCOL_PIPE, err, "Cannot connect to output pipe %s: %s", outputPipeName, err)

				os.Stdin = fr  // Read from output pipe (server->client)
				os.Stdout = fw // Write to input pipe (client->server)
				os.Stderr = fw // Write to input pipe (client->server)
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

		shutdownWorker := func(reason string) {
			// If running with worker-runner, send shutdown message so it can
			// unregister the worker before shutting down. Otherwise, shut down directly.
			if WorkerRunnerProtocol.Capable("shutdown") {
				WorkerRunnerProtocol.Send(workerproto.Message{
					Type: "shutdown",
				})
			} else {
				host.ImmediateShutdown(reason)
			}
		}

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
				shutdownWorker("generic-worker idle timeout")
			}
		case INTERNAL_ERROR:
			logEvent("instanceShutdown", nil, time.Now())
			if config.ShutdownMachineOnInternalError {
				shutdownWorker("generic-worker internal error")
			}
		case WORKER_MANAGER_SHUTDOWN:
			logEvent("instanceShutdown", nil, time.Now())
			shutdownWorker("worker manager requested termination")
		}
		os.Exit(int(exitCode))
	case arguments["install"]:
		// platform specific...
		err := install(arguments)
		exitOnError(CANT_INSTALL_GENERIC_WORKER, err, "Error installing generic worker")
	case arguments["new-ed25519-keypair"]:
		err := generateEd25519Keypair(arguments["--file"].(string))
		exitOnError(CANT_CREATE_ED25519_KEYPAIR, err, "Error generating ed25519 keypair %v for worker", arguments["--file"].(string))
	case arguments["copy-to-temp-file"]:
		tempFilePath, err := fileutil.CopyToTempFile(arguments["--copy-file"].(string))
		exitOnError(CANT_COPY_TO_TEMP_FILE, err, "Error copying file %v to temp file", arguments["--copy-file"].(string))
		fmt.Println(tempFilePath)
	case arguments["create-file"]:
		err := fileutil.CreateFile(arguments["--create-file"].(string))
		exitOnError(CANT_CREATE_FILE, err, "Error creating file %v", arguments["--create-file"].(string))
	case arguments["create-dir"]:
		err := fileutil.CreateDir(arguments["--create-dir"].(string))
		exitOnError(CANT_CREATE_DIRECTORY, err, "Error creating directory %v", arguments["--create-dir"].(string))
	case arguments["unarchive"]:
		err := fileutil.Unarchive(arguments["--archive-src"].(string), arguments["--archive-dst"].(string), arguments["--archive-fmt"].(string))
		exitOnError(CANT_UNARCHIVE, err, "Error unarchiving %v to %v", arguments["--archive-src"].(string), arguments["--archive-dst"].(string))
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
			PublicEngineConfig:             *gwconfig.DefaultPublicEngineConfig(),
			PublicPlatformConfig:           *gwconfig.DefaultPublicPlatformConfig(),
			AllowedHighMemoryDurationSecs:  5,
			CachesDir:                      "caches",
			CleanUpTaskDirs:                true,
			DisableOOMProtection:           false,
			DisableReboots:                 false,
			DownloadsDir:                   "downloads",
			EnableChainOfTrust:             true,
			EnableInteractive:              true,
			EnableLiveLog:                  true,
			EnableMetadata:                 true,
			EnableMounts:                   true,
			EnableOSGroups:                 true,
			EnableResourceMonitor:          true,
			EnableTaskclusterProxy:         true,
			IdleTimeoutSecs:                0,
			InteractivePort:                53654,
			LiveLogExecutable:              "livelog",
			LiveLogPortBase:                60098,
			MaxMemoryUsagePercent:          90,
			MaxTaskRunTime:                 86400,     // 86400s is 24 hours
			MinAvailableMemoryBytes:        524288000, // 500 MiB
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
			WorkerTypeMetadata:             map[string]any{},
		},
	}

	// apply values from config file
	err = configFile.UpdateConfig(config)
	if err != nil {
		return err
	}

	// Add useful worker config to worker metadata
	gwMetadata := map[string]any{
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
	addEngineDebugInfo(debugInfo, config)
	addEngineMetadata(gwMetadata, config)
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
		exposer, err = expose.NewLocal(config.PublicIP, config.LiveLogExposePort)
	}
	return err
}

func ReadTasksResolvedFile() uint {
	b, err := os.ReadFile(trcPath)
	if err != nil {
		log.Printf("could not open %q: %s (ignored)", trcPath, err)
		return 0
	}
	i, err := strconv.Atoi(string(b))
	if err != nil {
		// treat an invalid (usually empty) file as nonexistent
		log.Printf("could not parse content of %q: %s (ignored)", trcPath, err)
		return 0
	}
	return uint(i)
}

// Also called from tests, so avoid panic in this function since this could
// cause tests to silently pass - instead require error handling.
func UpdateTasksResolvedFile(t uint) error {
	err := os.WriteFile(trcPath, []byte(strconv.Itoa(int(t))), 0777)
	if err != nil {
		return err
	}
	return fileutil.SecureFiles(trcPath)
}

// HandleCrash reports a crash in worker logs and reports the crash to sentry
// if it has valid credentials and a valid sentry project. The argument r is
// the object returned by the recover call, thrown by the panic call that
// caused the worker crash.
func HandleCrash(r any) {
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
	engineInit()

	// This *DOESN'T* output secret fields, so is SAFE
	log.Printf("Config: %v", config)
	log.Printf("Detected %s platform", runtime.GOOS)
	log.Printf("Detected %s engine", engine)
	if host, err := sysinfo.Host(); err == nil {
		logEvent("instanceBoot", nil, host.Info().BootTime)
	}
	log.Printf("Working directory: %q", cwd)
	log.Printf("Tasks resolved count file: %q", trcPath)

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
		return featureInitFailure(err)
	}

	// loop, claiming and running tasks!
	lastActive := time.Now()
	// use zero value, to be sure that a check is made before first task runs
	lastReportedNoTasks := time.Now()
	sigInterrupt := make(chan os.Signal, 1)
	signal.Notify(sigInterrupt, os.Interrupt)
	if RotateTaskEnvironment() {
		return REBOOT_REQUIRED
	}
	for {
		if checkWhetherToTerminate() {
			return WORKER_MANAGER_SHUTDOWN
		}

		// Ensure there is enough disk space *before* claiming a task
		err := garbageCollection()
		if err != nil {
			panic(err)
		}

		if graceful.TerminationRequested() {
			return WORKER_SHUTDOWN
		}

		pdTaskUser := currentPlatformData()
		err = validateGenericWorkerBinary(pdTaskUser)
		if err != nil {
			log.Printf("Invalid generic-worker binary: %v", err)
			return INTERNAL_ERROR
		}

		task := ClaimWork()

		// make sure at least 5 seconds pass between tcqueue.ClaimWork API calls
		wait5Seconds := time.NewTimer(time.Second * 5)

		if task != nil {
			logEvent("taskQueued", task, time.Time(task.Definition.Created))
			logEvent("taskStart", task, time.Now())

			task.pd = pdTaskUser
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

				if checkWhetherToTerminate() {
					return WORKER_MANAGER_SHUTDOWN
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

func checkWhetherToTerminate() bool {
	if withWorkerRunner {
		workerManager := serviceFactory.WorkerManager(config.Credentials(), config.RootURL)
		swtr, err := workerManager.ShouldWorkerTerminate(config.ProvisionerID+"/"+config.WorkerType, config.WorkerGroup, config.WorkerID)
		if err != nil {
			log.Printf("WARNING: could not determine whether I need to terminate: %v", err)
		} else {
			if swtr.Terminate {
				log.Print("Terminating, since Worker Manager told me to")
			} else {
				log.Print("Not terminating, worker manager loves me")
			}
		}
		return swtr.Terminate
	}
	log.Print("Not running with Worker Manager, not checking whether I need to terminate")
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
			TaskGroupID:       taskResponse.Status.TaskGroupID,
			Status:            claimed,
			Definition:        taskResponse.Task,
			Queue:             taskQueue,
			TaskClaimResponse: tcqueue.TaskClaimResponse(taskResponse),
			Artifacts:         map[string]artifacts.TaskArtifact{},
			featureArtifacts:  map[string]string{},
			LocalClaimTime:    localClaimTime,
		}
		defaults.SetDefaults(&task.Payload)
		task.StatusManager = NewTaskStatusManager(task)
		return task
	}
}

func (task *TaskRun) validateJSON(input []byte, schema string) *CommandExecutionError {
	// Parse the JSON schema
	schemaLoader := gojsonschema.NewStringLoader(schema)
	documentLoader := gojsonschema.NewBytesLoader(input)

	// Perform the validation
	result, err := gojsonschema.Validate(schemaLoader, documentLoader)
	if err != nil {
		return MalformedPayloadError(err)
	}

	// Check if the validation failed
	if result.Valid() {
		return nil
	}

	task.Errorf("Task payload for this worker type must conform to the following jsonschema:\n%s", schema)
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
	// caused by execution of Turing complete code.
	//
	// If however, we run some executable code referenced in `task.payload`
	// and the code crashes or exists non-zero, then the task is said to be
	// failed. The difference is whether or not the unexpected behavior
	// happened before or after the execution of task specific Turing
	// complete code.
	return MalformedPayloadError(fmt.Errorf("validation of payload failed for task %v", task.TaskID))
}

// validateGenericWorkerBinary runs `generic-worker --version` as the
// task user to ensure that the binary is readable and executable before
// the worker claims any tasks. This is useful to test that the task user
// has permissions to run generic-worker subcommands, which are used
// internally during the artifact upload process. The version string
// is not returned, since it is not needed. A non-nil error is returned
// if the `generic-worker --version` command cannot be run successfully.
func validateGenericWorkerBinary(pd *process.PlatformData) error {
	cmd, err := gwVersion(pd)
	if err != nil {
		panic(fmt.Errorf("could not create command to determine generic-worker binary version: %v", err))
	}

	result := cmd.Execute()
	if !result.Succeeded() {
		return fmt.Errorf("generic-worker binary is not readable and executable by task user: %v", result)
	}

	return nil
}

// CommandExecutionError wraps error Cause which has occurred during task
// execution, which should result in the task being resolved as
// TaskStatus/Reason (e.g. exception/malformed-payload)
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

// task exception/resource-unavailable error, caused by underlying error err
func ResourceUnavailable(err error) *CommandExecutionError {
	return executionError(resourceUnavailable, errored, err)
}

// task exception/malformed-payload error, caused by underlying error err
func MalformedPayloadError(err error) *CommandExecutionError {
	return executionError(malformedPayload, errored, err)
}

// task failure, caused by underlying error err
func Failure(err error) *CommandExecutionError {
	return executionError("", failed, err)
}

func (task *TaskRun) Infof(format string, v ...any) {
	task.Info(fmt.Sprintf(format, v...))
}

func (task *TaskRun) Warnf(format string, v ...any) {
	task.Warn(fmt.Sprintf(format, v...))
}

func (task *TaskRun) Errorf(format string, v ...any) {
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
//
//	[taskcluster 2017-01-25T23:31:13.787Z] Hey, hey, we're The Monkees.
func (task *TaskRun) Log(prefix, message string) {
	task.logMux.Lock()
	defer task.logMux.Unlock()
	if task.logWriter != nil {
		for line := range strings.SplitSeq(message, "\n") {
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
	return slices.Contains(task.Payload.OnExitStatus.Retry, c)
}

func (task *TaskRun) ExecuteCommand(index int) *CommandExecutionError {
	task.Infof("Executing command %v: %v", index, task.formatCommand(index))
	log.Print("Executing command " + strconv.Itoa(index) + ": " + task.Commands[index].String())
	cee := task.prepareCommand(index)
	if cee != nil {
		panic(cee)
	}
	task.result = task.Commands[index].Execute()
	task.Infof("%v", task.result)

	if ae := task.StatusManager.AbortException(); ae != nil {
		return ae
	}

	switch {
	case task.result.Failed():
		if task.IsIntermittentExitCode(int64(task.result.ExitCode)) {
			return &CommandExecutionError{
				Cause:      fmt.Errorf("task appears to have failed intermittently - exit code %v found in task payload.onExitStatus list", task.result.ExitCode),
				Reason:     intermittentTask,
				TaskStatus: errored,
			}
		} else {
			return &CommandExecutionError{
				Cause:      task.result.FailureCause(),
				TaskStatus: failed,
			}
		}
	case task.result.Crashed():
		panic(task.result.CrashCause())
	}
	return nil
}

// ExecutionErrors is a growable slice of errors to collect command execution errors as they occur
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

func (task *TaskRun) Run() (err *ExecutionErrors) {

	// err is essentially a list of all errors that occur. We'll base the task
	// resolution on the first error that occurs. The err.add(<error-or-nil>)
	// function is a simple way of adding an error to the list, if one occurs,
	// otherwise not adding it, if it is nil

	// note, since we return the value pointed to by `err`, we can continue
	// to manipulate `err` even in defer statements, and this will affect
	// return value of this method.

	err = &ExecutionErrors{}

	workerStatus := &WorkerStatus{
		CurrentTaskIDs: []string{task.TaskID},
	}
	err.add(executionError(internalError, errored, fileutil.WriteToFileAsJSON(workerStatus, workerStatusPath)))
	defer os.Remove(workerStatusPath)

	defer func() {
		if r := recover(); r != nil {
			err.add(executionError(internalError, errored, fmt.Errorf("%#v", r)))
			defer panic(r)
		}
		err.add(task.resolve(err))
	}()

	log.Printf("Running task %v/tasks/%v/runs/%v", config.RootURL, task.TaskID, task.RunID)

	// create task features
	for _, feature := range features {
		if feature.IsRequested(task) {
			if !feature.IsEnabled() {
				workerPoolID := config.ProvisionerID + "/" + config.WorkerType
				workerManagerURL := config.RootURL + "/worker-manager/" + url.PathEscape(workerPoolID)
				err.add(MalformedPayloadError(fmt.Errorf(`this task is attempting to use feature %q, but it's not enabled on this worker pool (%s)
If you do not require this feature, remove the toggle from the task definition.
If you do require this feature, please do one of two things:
	1. Contact the owner of the worker pool %s (see %s) and ask for %q to be enabled.
	2. Use a worker pool that already allows %q`, feature.Name(), workerPoolID, workerPoolID, workerManagerURL, feature.Name(), feature.Name())))
				return
			}
			log.Printf("Starting task feature %v...", feature.Name())
			taskFeature := feature.NewTaskFeature(task)
			requiredScopes := taskFeature.RequiredScopes()
			scopesSatisfied, scopeValidationErr := scopes.Given(task.Definition.Scopes).Satisfies(requiredScopes, serviceFactory.Auth(config.Credentials(), config.RootURL))
			if scopeValidationErr != nil {
				// presumably we couldn't expand assume:* scopes due to auth
				// service unavailability
				err.add(ResourceUnavailable(scopeValidationErr))
				return
			}
			if !scopesSatisfied {
				err.add(MalformedPayloadError(fmt.Errorf("Feature %q requires scopes:\n\n%v\n\nbut task only has scopes:\n\n%v\n\nYou probably should add some scopes to your task definition", feature.Name(), requiredScopes, scopes.Given(task.Definition.Scopes))))
				return
			}
			reservedArtifacts := taskFeature.ReservedArtifacts()
			task.featureArtifacts[task.Payload.Logs.Backing] = "Backing log"
			for _, a := range reservedArtifacts {
				if f := task.featureArtifacts[a]; f != "" {
					err.add(MalformedPayloadError(fmt.Errorf("Feature %q wishes to publish artifact %v but feature %v has already reserved this artifact name", feature.Name(), a, f)))
				} else {
					task.featureArtifacts[a] = feature.Name()
				}
			}
			if err.Occurred() {
				return
			}
			err.add(taskFeature.Start())
			// make sure we defer Stop() even if Start() returns an error, since the feature may have made
			// changes that need cleaning up in Stop() before it hit the error that it returned...
			defer func(feature Feature) {
				log.Printf("Stopping task feature %v...", feature.Name())
				taskFeature.Stop(err)
			}(feature)
			if err.Occurred() {
				return
			}
		}
	}
	return
}

func loadFromJSONFile(obj any, filename string) (err error) {
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
	fi, err := os.ReadDir(parentDir)
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
	return task.pd.ReleaseResources()
}

type TaskContext struct {
	TaskDir string
	User    *gwruntime.OSUser
}

type WorkerStatus struct {
	CurrentTaskIDs []string `json:"currentTaskIds"`
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

func exitOnError(exitCode ExitCode, err error, logMessage string, args ...any) {
	if err == nil {
		return
	}
	log.Printf(logMessage, args...)
	log.Printf("Root cause: %v", err)
	log.Printf("%#v (%T)", err, err)
	combinedErr := fmt.Errorf("%s, args: %v, root cause: %v, exit code: %d", logMessage, args, err, exitCode)
	if WorkerRunnerProtocol != nil {
		errorreport.Send(WorkerRunnerProtocol, combinedErr, debugInfo)
	}
	os.Exit(int(exitCode))
}
