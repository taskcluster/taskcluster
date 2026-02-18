//go:build multiuser

package main

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

const dockerImage = "gw-test-multiuser"

func TestMain(m *testing.M) {
	// Already inside Docker — run tests normally
	if os.Getenv("GW_IN_DOCKER") == "1" {
		os.Exit(m.Run())
	}

	// next-task-user.json exists — can run natively (CI or local Linux with setup)
	if _, err := os.Stat(filepath.Join(cwd, "next-task-user.json")); err == nil {
		os.Exit(m.Run())
	}

	// Only route to Docker on Linux (macOS/Windows multiuser tests run natively)
	if runtime.GOOS != "linux" {
		os.Exit(m.Run())
	}

	// Linux + no next-task-user.json + not in Docker — route to Docker
	os.Exit(runInDocker())
}

// repoRoot walks up from cwd to find the directory containing go.mod.
func repoRoot() (string, error) {
	dir := cwd
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", fmt.Errorf("could not find go.mod in any parent of %s", cwd)
		}
		dir = parent
	}
}

// ensureDockerImage builds the Docker image if it doesn't already exist.
func ensureDockerImage() error {
	check := exec.Command("docker", "image", "inspect", dockerImage)
	if check.Run() == nil {
		return nil
	}

	fmt.Fprintf(os.Stderr, "Building Docker image %s...\n", dockerImage)
	dockerfilePath := filepath.Join(cwd, "Dockerfile.test")
	build := exec.Command("docker", "build", "-f", dockerfilePath, "-t", dockerImage, cwd)
	build.Stdout = os.Stdout
	build.Stderr = os.Stderr
	return build.Run()
}

// translateTestFlags converts -test.* flags from os.Args into go test flags.
// When go test compiles and runs a test binary, the binary receives flags like
// -test.run=^TestFoo$, -test.v=true, -test.timeout=30s. We translate these
// back to go test flags (-run, -v, -timeout) for the inner go test invocation.
func translateTestFlags() []string {
	var flags []string
	for _, arg := range os.Args[1:] {
		switch {
		case strings.HasPrefix(arg, "-test.run="):
			flags = append(flags, "-run="+strings.TrimPrefix(arg, "-test.run="))
		case strings.HasPrefix(arg, "-test.timeout="):
			flags = append(flags, "-timeout="+strings.TrimPrefix(arg, "-test.timeout="))
		case arg == "-test.v=true":
			flags = append(flags, "-v")
		case strings.HasPrefix(arg, "-test.count="):
			flags = append(flags, "-count="+strings.TrimPrefix(arg, "-test.count="))
		case arg == "-test.failfast=true":
			flags = append(flags, "-failfast")
		case arg == "-test.short=true":
			flags = append(flags, "-short")
		}
	}
	return flags
}

func runInDocker() int {
	root, err := repoRoot()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error finding repo root: %v\n", err)
		return 1
	}

	if err := ensureDockerImage(); err != nil {
		fmt.Fprintf(os.Stderr, "Error building Docker image: %v\n", err)
		return 1
	}

	testFlags := translateTestFlags()
	parts := []string{
		"go install ../../tools/livelog &&",
		"go install ../../tools/taskcluster-proxy &&",
		"go install -tags multiuser ./... &&",
		"go test -tags multiuser",
	}
	parts = append(parts, testFlags...)
	parts = append(parts, "./...")
	innerCmd := strings.Join(parts, " ")

	fmt.Fprintf(os.Stderr, "Running multiuser tests in Docker...\n")

	args := []string{
		"run", "--rm",
		"-v", root + ":/src",
		"-v", "gw-test-gomodcache:/go/pkg/mod",
		"-v", "gw-test-gobuildcache:/root/.cache/go-build",
		"-e", "GW_IN_DOCKER=1",
		"-w", "/src/workers/generic-worker",
		dockerImage,
		"sh", "-c", innerCmd,
	}

	cmd := exec.Command("docker", args...)
	stdout, _ := cmd.StdoutPipe()
	stderr, _ := cmd.StderrPipe()

	if err := cmd.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "Error starting Docker: %v\n", err)
		return 1
	}

	go func() { _, _ = io.Copy(os.Stdout, stdout) }()
	go func() { _, _ = io.Copy(os.Stderr, stderr) }()

	if err := cmd.Wait(); err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			return exitErr.ExitCode()
		}
		fmt.Fprintf(os.Stderr, "Error running Docker: %v\n", err)
		return 1
	}
	return 0
}
