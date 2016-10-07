// Package command is work in progress, and may be abandoned.
package command

import "errors"

type Command interface {
	Start() error
	Wait() error
	Abort() error
}

type Runner struct {
	commands                    []Command
	currentIndex                int
	aborted, completed, started bool
	startCh, abortCh, waitCh    chan bool
	resultCh                    chan error
}

func NewRunner(commands []Command) *Runner {
	runner := &Runner{
		commands:     commands,
		currentIndex: 0,
		aborted:      false,
		completed:    false,
		started:      false,
		abortCh:      make(chan bool),
		waitCh:       make(chan bool),
		resultCh:     make(chan error),
	}
	go runner.listen()
	return runner
}

func (r *Runner) Wait() error {
	r.waitCh <- true
	return <-r.resultCh
}

func (r *Runner) Start() error {
	r.startCh <- true
	return <-r.resultCh
}

func (r *Runner) Abort() error {
	r.abortCh <- true
	return <-r.resultCh
}

func (r *Runner) listen() {
	// make sure start comes before abort or wait
	select {
	case <-r.startCh:
		err := r.start()
		if err != nil {
			r.resultCh <- err
			return
		}
	case <-r.waitCh:
		r.resultCh <- errors.New("Cannot abort runner - it has not already started")
	case <-r.abortCh:
		r.resultCh <- errors.New("Cannot abort runner - it has not already started")
	}
	// at this point we have started command
	for {
		select {
		case <-r.startCh:
			r.resultCh <- errors.New("Cannot start runner - previsouly already started")
		case <-r.waitCh:
		case <-r.abortCh:
		}
		if r.completed {
			break
		}
	}
}

func (r *Runner) start() error {
	if r.started {
		return errors.New("Cannot start runner - previsouly already started")
	}
	r.started = true
	commandCh, resultCh := r.commandRunner()
	go func() {
		for i := range r.commands {
			commandCh <- r.commands[i]
			select {
			case err := <-resultCh:
				if err != nil {
					break
				}
			case <-r.abortCh:
				r.resultCh <- r.commands[i].Abort()
				break
			}
		}
	}()
	return nil
}

func (r *Runner) commandRunner() (chan Command, chan error) {
	commandCh := make(chan Command)
	resultCh := make(chan error)
	go func() {
		command := <-commandCh
		err := command.Start()
		if err != nil {
			resultCh <- err
			return
		}
		resultCh <- command.Wait()
	}()
	return commandCh, resultCh
}
