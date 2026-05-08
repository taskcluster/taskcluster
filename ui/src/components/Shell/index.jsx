import React, { Component } from 'react';
import { withStyles } from '@material-ui/core/styles';
import { string } from 'prop-types';
import { hterm, lib } from 'hterm-umdjs';
import withAlertOnClose from '../../utils/withAlertOnClose';

const DECODER = new TextDecoder('utf-8', { fatal: false });
// Keep these in sync with the go code
const MSG_PTY_DATA = 1;
const MSG_RESIZE_DATA = 2;

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
        // legacy docker worker (removed)
        case '1':
          io.println(
            'Interactive shell API version 1 (docker-worker) is no longer supported. Docker-worker has been removed, use generic-worker instead.'
          );

          return;
        // generic worker
        case '2':
          this.wsClient = new WebSocket(url);
          this.wsClient.binaryType = 'arraybuffer';
          io.sendString = d => {
            const txt = new TextEncoder().encode(d);
            const buf = new Uint8Array([[MSG_PTY_DATA], ...txt]);

            this.wsClient.send(buf);
          };

          io.onVTKeystroke = io.sendString;

          io.onTerminalResize = (w, h) => {
            if (this.wsClient.readyState === WebSocket.OPEN) {
              const buf = Buffer.alloc(5);

              buf.writeUInt8(MSG_RESIZE_DATA);
              buf.writeUInt16LE(h, 1);
              buf.writeUInt16LE(w, 3);
              this.wsClient.send(buf);
            }
          };

          this.wsClient.onmessage = ({ data }) => {
            if (typeof data === 'string') {
              // Generic-worker 60.3.5 and previous were sending text on the
              // websocket, this ended up being an issue for invalid UTF-8.
              // We switched to binary after, but we keep this here for
              // backwards compatibility
              io.writeUTF16(data);
            } else {
              io.writeUTF8(DECODER.decode(data));
            }
          };

          this.wsClient.onopen = () => {
            const sz = terminal.screenSize;

            io.onTerminalResize(sz.width, sz.height);
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
