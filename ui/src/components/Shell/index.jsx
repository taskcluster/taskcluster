import React, { Component } from 'react';
import { withStyles } from '@material-ui/core/styles';
import { string } from 'prop-types';
import { hterm, lib } from 'hterm-umdjs';
import { DockerExecClient } from 'docker-exec-websocket-client';
import withAlertOnClose from '../../utils/withAlertOnClose';

const DECODER = new TextDecoder('utf-8');
const defaultCommand = [
  'sh',
  '-c',
  [
    'if [ -f "/etc/taskcluster-motd" ]; then cat /etc/taskcluster-motd; fi;',
    'if [ -z "$TERM" ]; then export TERM=xterm; fi;',
    'if [ -z "$HOME" ]; then export HOME=/root; fi;',
    'if [ -z "$USER" ]; then export USER=root; fi;',
    'if [ -z "$LOGNAME" ]; then export LOGNAME=root; fi;',
    'if [ -z `which "$SHELL"` ]; then export SHELL=bash; fi;',
    'if [ -z `which "$SHELL"` ]; then export SHELL=sh; fi;',
    'if [ -z `which "$SHELL"` ]; then export SHELL="/.taskclusterutils/busybox sh"; fi;',
    'SPAWN="$SHELL";',
    'if [ "$SHELL" = "bash" ]; then SPAWN="bash -li"; fi;',
    'if [ -f "/bin/taskcluster-interactive-shell" ]; then SPAWN="/bin/taskcluster-interactive-shell"; fi;',
    'exec $SPAWN;',
  ].join(''),
];

hterm.defaultStorage = new lib.Storage.Local();

@withAlertOnClose
@withStyles({
  shell: {
    position: 'absolute',
    height: '100%',
    width: '100%',
  },
})
export default class Shell extends Component {
  static propTypes = {
    url: string.isRequired,
    version: string.isRequired,
    taskId: string.isRequired,
  };

  componentDidMount() {
    const terminal = new hterm.Terminal('interactive');
    const { url, version, taskId } = this.props;

    terminal.onTerminalReady = async () => {
      // We do this before we connect, so that the terminal window size is known
      // when we send the window size.
      const io = terminal.io.push();
      const options = {
        url,
        tty: true,
        command: defaultCommand,
      };

      io.onTerminalResize = () => null;
      terminal.setCursorPosition(0, 0);
      terminal.setCursorVisible(true);
      terminal.setScrollbarVisible(false);
      /* eslint-disable no-underscore-dangle */
      terminal.prefs_.set('ctrl-c-copy', true);
      terminal.prefs_.set('ctrl-v-paste', true);
      terminal.prefs_.set('use-default-window-copy', true);
      /* eslint-enable no-underscore-dangle */

      // Create a shell client, with interface similar to child_process
      // With an additional method client.resize(cols, rows) for TTY sizing.
      switch (version) {
        // docker worker
        case '1':
          io.sendString = d => this.client?.stdin.write(d);
          io.onVTKeystroke = io.sendString;

          this.client = new DockerExecClient(options);
          await this.client.execute();

          this.client.resize.apply(this.client, [
            terminal.screenSize.height,
            terminal.screenSize.width,
          ]);

          this.client.on('exit', code => {
            io.writeUTF8(`\r\nRemote shell exited: ${code}\r\n`);
            terminal.uninstallKeyboard();
            terminal.setCursorVisible(false);
          });

          this.client.resize(
            terminal.screenSize.width,
            terminal.screenSize.height
          );
          io.onTerminalResize = (c, r) => this.client.resize(c, r);
          this.client.stdout.on('data', data =>
            io.writeUTF8(DECODER.decode(data))
          );
          this.client.stderr.on('data', data =>
            io.writeUTF8(DECODER.decode(data))
          );
          this.client.stdout.resume();
          this.client.stderr.resume();

          break;
        // generic worker
        case '2':
          this.wsClient = new WebSocket(url);
          this.cmd = [];
          this.currentCmd = 0;
          this.prompt = '$ ';
          // minCol is the minimum column to start printing at
          // and to stop deleting at
          // accounts for the prompt "$ "
          this.minCol = 2;

          io.sendString = d => {
            switch (d) {
              // return key
              case '\r': {
                if (!this.cmd[this.currentCmd]) {
                  io.print(`\n\r${this.prompt}`);

                  break;
                }

                io.println('');

                this.wsClient?.send(`${this.cmd[this.currentCmd]}\n`);

                this.currentCmd += 1;

                break;
              }

              // backspace key
              case '\b':
              case '\u007f': {
                const col = terminal.getCursorColumn();
                // calculate the offset of the current cursor
                // position from the start of the command
                const cursorOffset = col - this.minCol;

                // don't delete the prompt!
                if (cursorOffset <= 0) {
                  break;
                }

                terminal.eraseLine();

                // get the current command on this row,
                // or an empty string if none exists
                const currCmd = this.cmd[this.currentCmd] || '';
                // calculate the index of the character to
                // delete in the current command string
                const deleteIndex = cursorOffset - 1;
                // construct the new command string without
                // the deleted character
                const newCmd =
                  currCmd.slice(0, deleteIndex) +
                  currCmd.slice(deleteIndex + 1);

                this.cmd[this.currentCmd] = newCmd;

                // print the updated command prompt and command string
                io.print(`\r${this.prompt}${this.cmd[this.currentCmd] || ''}`);

                terminal.setCursorColumn(col - 1);

                break;
              }

              // up arrow
              case '\u001b[A': {
                break;
              }

              // down arrow
              case '\u001b[B': {
                break;
              }

              // right arrow
              case '\u001b[C': {
                const row = terminal.getCursorRow();
                const col = terminal.getCursorColumn();
                const currCmd = this.cmd[this.currentCmd] || '';

                if (currCmd && col < this.minCol + currCmd.length) {
                  io.print('\u001b[C');
                  terminal.setCursorPosition(row, col + 1);
                }

                break;
              }

              // left arrow
              case '\u001b[D': {
                const row = terminal.getCursorRow();
                const col = terminal.getCursorColumn();

                if (col > this.minCol) {
                  io.print('\u001b[D');
                  terminal.setCursorPosition(row, col - 1);
                }

                break;
              }

              default: {
                const col = terminal.getCursorColumn();
                const currCmd = this.cmd[this.currentCmd] || '';

                if (currCmd) {
                  const strBefore = currCmd.slice(0, col - this.minCol);
                  const strAfter = currCmd.slice(col - this.minCol);

                  this.cmd[this.currentCmd] = strBefore + d + strAfter;
                } else {
                  this.cmd[this.currentCmd] = d;
                }

                io.print(`\r${this.prompt}${this.cmd[this.currentCmd] || ''}`);

                terminal.setCursorColumn(col + 1);

                break;
              }
            }
          };

          io.onVTKeystroke = io.sendString;

          this.wsClient.onmessage = ({ data }) => {
            io.print(`\r${data}`);
            io.print(`\r${this.prompt}`);
          };

          this.wsClient.onopen = () => {
            io.print(this.prompt);
          };

          this.wsClient.onclose = () => {
            io.println(`\r\nRemote shell closed`);
            terminal.uninstallKeyboard();
            terminal.setCursorVisible(false);
          };

          this.wsClient.onerror = err => {
            io.println(`\r\nRemote shell error: ${err}`);
            terminal.uninstallKeyboard();
            terminal.setCursorVisible(false);
          };

          break;
        default:
          io.println(`Interactive shell API version ${version} not supported`);

          break;
      }

      terminal.installKeyboard();
      io.println(`Connected to remote shell for taskId: ${taskId}`);
    };

    if (this.node) {
      terminal.decorate(this.node);
    }
  }

  registerChild = ref => (this.node = ref);

  render() {
    return (
      <div ref={this.registerChild} className={this.props.classes.shell} />
    );
  }
}
