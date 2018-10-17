import React, { Component } from 'react';
import { withStyles } from '@material-ui/core/styles';
import { string } from 'prop-types';
import { hterm, lib } from 'hterm-umd';
import { DockerExecClient } from 'docker-exec-websocket-server';
import { dial } from 'ws-shell';

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

      io.sendString = d => this.client && this.client.stdin.write(d);
      io.onVTKeystroke = io.sendString;
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
      if (version === '1') {
        this.client = new DockerExecClient(options);
        await this.client.execute();

        // Wrap client.resize to switch argument ordering
        const { resize } = this.client;

        this.client.resize = (c, r) => resize.call(this.client, r, c);
      } else if (version === '2') {
        this.client = await dial(options);
      }

      terminal.installKeyboard();
      io.writeUTF8(`Connected to remote shell for taskId: ${taskId}\r\n`);

      this.client.on('exit', code => {
        io.writeUTF8(`\r\nRemote shell exited: ${code}\r\n`);
        terminal.uninstallKeyboard();
        terminal.setCursorVisible(false);
      });

      this.client.resize(terminal.screenSize.width, terminal.screenSize.height);
      io.onTerminalResize = (c, r) => this.client.resize(c, r);
      this.client.stdout.on('data', data => io.writeUTF8(DECODER.decode(data)));
      this.client.stderr.on('data', data => io.writeUTF8(DECODER.decode(data)));
      this.client.stdout.resume();
      this.client.stderr.resume();
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
