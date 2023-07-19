//go:build darwin || linux || freebsd

package interactive

import (
	"context"
	"encoding/binary"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"sync"
	"syscall"

	"github.com/creack/pty"
	"github.com/gorilla/websocket"
)

const (
	MsgStdin  = 1
	MsgResize = 2
)

type InteractiveJob struct {
	pty    *os.File
	cmd    *exec.Cmd
	errors chan error
	done   chan struct{}
	wsLock sync.Mutex
	conn   *websocket.Conn
	ctx    context.Context
}

func CreateInteractiveJob(createCmd CreateInteractiveProcess, conn *websocket.Conn, ctx context.Context) (itj *InteractiveJob, err error) {
	itj = &InteractiveJob{
		// size of 3 is because there
		// are only ever 3 goroutines
		// who write to this channel
		// and we don't want to block
		errors: make(chan error, 3),
		done:   make(chan struct{}),
		wsLock: sync.Mutex{},
		conn:   conn,
		ctx:    ctx,
	}

	cmd, err := createCmd()
	if err != nil {
		itj.reportError(fmt.Sprintf("Error while getting command %v", err))
		return
	}
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.Setpgid = false
	cmd.SysProcAttr.Setctty = true
	cmd.SysProcAttr.Setsid = true
	itj.cmd = cmd

	pty, err := pty.StartWithAttrs(cmd, nil, cmd.SysProcAttr)
	if err != nil {
		itj.reportError(fmt.Sprintf("Error while spawning command %v", err))
		return
	}
	itj.pty = pty

	go func() {
		itj.errors <- cmd.Wait()
		close(itj.done)
	}()

	go itj.copyCommandOutputStream()
	go itj.handleWebsocketMessages()

	return itj, err
}

func (itj *InteractiveJob) Terminate() (err error) {
	if itj.cmd.ProcessState != nil {
		return nil
	}

	return itj.cmd.Process.Kill()
}

func (itj *InteractiveJob) copyCommandOutputStream() {
	buf := make([]byte, 4096)
	for {
		select {
		case <-itj.ctx.Done():
			return
		case <-itj.done:
			return
		default:
			n, err := itj.pty.Read(buf)
			if err != nil {
				if err == io.EOF {
					continue
				}
				return
			}
			if n == 0 {
				continue
			}
			if err := itj.writeWsMessage(websocket.TextMessage, buf[:n]); err != nil {
				itj.errors <- err
				return
			}
		}
	}
}

func (itj *InteractiveJob) handleWebsocketMessages() {
	for {
		select {
		case <-itj.ctx.Done():
			return
		case <-itj.done:
			return
		case err := <-itj.errors:
			if err != nil {
				if !websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
					itj.reportError(fmt.Sprintf("Error occured: %v", err))
				}
			}
			err = itj.Terminate()
			if err != nil {
				log.Printf("Error while terminating process: %v", err)
			}
			return
		default:
			_, msg, err := itj.conn.ReadMessage()
			if err != nil {
				itj.errors <- err
				continue
			}

			if len(msg) == 0 {
				return
			}

			switch msg[0] {
			case MsgStdin:
				if _, err := itj.pty.Write(msg[1:]); err != nil {
					itj.errors <- err
				}
			case MsgResize:
				width := binary.LittleEndian.Uint16(msg[1:3])
				height := binary.LittleEndian.Uint16(msg[3:])
				sz := pty.Winsize{Rows: width, Cols: height}
				err := pty.Setsize(itj.pty, &sz)
				if err != nil {
					itj.errors <- err
				}
			default:
				log.Printf("Unknown message code received from interactive task")
			}
		}
	}
}

func (itj *InteractiveJob) reportError(errorMessage string) {
	log.Println(errorMessage)
	err := itj.writeWsMessage(websocket.TextMessage, []byte(errorMessage))
	if err != nil {
		log.Println("Error while reporting error to client")
	}
}

func (itj *InteractiveJob) writeWsMessage(messageType int, message []byte) (err error) {
	itj.wsLock.Lock()
	defer itj.wsLock.Unlock()
	return itj.conn.WriteMessage(messageType, message)
}
