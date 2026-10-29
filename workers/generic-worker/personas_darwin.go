//go:build multiuser

package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os/exec"
	"strings"
	"time"

	"github.com/taskcluster/taskcluster/v114/workers/generic-worker/personakb"
)

const (
	personaKBPath        = "/private/var/db/keybags/persona.kb"
	dsclTimeout          = time.Minute
	prunePersonasTimeout = 2 * time.Minute
)

// prunePersonas removes records of deleted users from the usermanagerd
// persona database if it has at least minRecords records. The root user,
// the current and next task users, and requiredUsers must exist and are
// kept. Errors are logged. It waits at most prunePersonasTimeout for the
// pruning to complete.
func prunePersonas(minRecords int, requiredUsers ...string) {
	if config.HeadlessTasks || runningTests {
		return
	}
	users := append([]string{"root"}, requiredUsers...)
	if taskContext != nil && taskContext.User != nil && taskContext.User.Name != "" {
		users = append(users, taskContext.User.Name)
	}
	if nextTaskUser != "" {
		users = append(users, nextTaskUser)
	}
	done := make(chan struct{})
	go func() {
		defer close(done)
		defer func() {
			if r := recover(); r != nil {
				log.Printf("WARNING: could not prune persona records from %v: %v", personaKBPath, r)
			}
		}()
		removed, err := prunePersonaKB(minRecords, users)
		if removed > 0 {
			log.Printf("Pruned %v stale persona records from %v", removed, personaKBPath)
		}
		if err != nil {
			log.Printf("WARNING: could not prune persona records from %v: %v", personaKBPath, err)
		}
	}()
	select {
	case <-done:
	case <-time.After(prunePersonasTimeout):
		log.Printf("WARNING: pruning persona records from %v did not complete within %v; continuing without waiting", personaKBPath, prunePersonasTimeout)
	}
}

func prunePersonaKB(minRecords int, users []string) (int, error) {
	out, err := dscl(".", "-list", "/Users", "GeneratedUID")
	if err != nil {
		return 0, fmt.Errorf("listing GeneratedUIDs: %w", err)
	}
	live, err := personakb.ParseDSCLGeneratedUIDs(out)
	if err != nil {
		return 0, err
	}
	required := make([]string, 0, len(users))
	for _, user := range users {
		out, err := dscl(".", "-read", "/Users/"+user, "GeneratedUID")
		if err != nil {
			return 0, fmt.Errorf("reading GeneratedUID of %v: %w", user, err)
		}
		guid, err := personakb.ParseDSCLReadGeneratedUID(out)
		if err != nil {
			return 0, fmt.Errorf("reading GeneratedUID of %v: %w", user, err)
		}
		required = append(required, guid)
	}
	if err := personakb.RequireGUIDs(live, required...); err != nil {
		return 0, err
	}
	return personakb.PruneFile(personaKBPath, live, minRecords)
}

func dscl(args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), dsclTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "/usr/bin/dscl", args...)
	cmd.WaitDelay = 5 * time.Second
	out, err := cmd.Output()
	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			return "", fmt.Errorf("dscl %v: %w: %s", strings.Join(args, " "), err, strings.TrimSpace(string(exitErr.Stderr)))
		}
		return "", fmt.Errorf("dscl %v: %w", strings.Join(args, " "), err)
	}
	return string(out), nil
}
