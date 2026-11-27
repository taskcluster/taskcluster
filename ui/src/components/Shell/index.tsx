import Box from '@mui/material/Box';
import { hterm, lib } from 'hterm-umdjs';
import { useEffect, useRef } from 'react';

// Keep these in sync with the go code
const MSG_PTY_DATA = 1;
const MSG_RESIZE_DATA = 2;

const keepOnPage = (e: BeforeUnloadEvent) => e.preventDefault();
const encoder = new TextEncoder();

hterm.defaultStorage = new lib.Storage.Local();

hterm.notify = () => {};
hterm.VT.OSC['1337'] = () => {};
hterm.openUrl = (url: string) => {
  const parsed = URL.parse(url);

  if (parsed && ['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
    window.open(parsed.href, '_blank', 'noopener');
  }
};

export interface ShellProps {
  url: string;
  version: string;
  taskId: string;
}

const ptyDataMessage = (data: string) => {
  const bytes = encoder.encode(data);

  const message = new Uint8Array(bytes.length + 1);
  message[0] = MSG_PTY_DATA;
  message.set(bytes, 1);

  return message;
};

const resizeMessage = (width: number, height: number) => {
  const view = new DataView(new ArrayBuffer(5));

  view.setUint8(0, MSG_RESIZE_DATA);
  view.setUint16(1, height, true);
  view.setUint16(3, width, true);

  return view.buffer;
};

export default function Shell({ url, version, taskId }: ShellProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const terminal = new hterm.Terminal('interactive');
    const node = ref.current;
    let ws: WebSocket | undefined;
    let disposed = false;

    terminal.onTerminalReady = () => {
      if (disposed) {
        return;
      }

      const { io } = terminal;
      const println = (line: string) => io.writeUTF8(`${line}\r\n`);

      terminal.setCursorPosition(0, 0);
      terminal.setCursorVisible(true);
      terminal.setScrollbarVisible(false);
      terminal.prefs_.set('ctrl-c-copy', true);
      terminal.prefs_.set('ctrl-v-paste', true);
      terminal.prefs_.set('use-default-window-copy', true);
      terminal.prefs_.set('enable-clipboard-write', false);
      terminal.vt.characterEncoding = 'raw';
      terminal.keyboard.characterEncoding = 'raw';
      terminal.setWindowTitle = title => {
        document.title = `Shell: ${title} - ${window.env.APPLICATION_NAME}`;
      };

      if (version !== '2') {
        println(`Interactive shell API version ${version} not supported`);
        return;
      }

      try {
        ws = new WebSocket(url);
      } catch {
        println(`Invalid remote shell URL: ${url}`);
        return;
      }

      const socket = ws;
      const decoder = new TextDecoder();
      let connected = false;

      socket.binaryType = 'arraybuffer';
      io.sendString = data => socket.send(ptyDataMessage(data));
      io.onVTKeystroke = io.sendString;
      io.onTerminalResize = (width, height) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(resizeMessage(width, height));
        }
      };

      socket.onmessage = ({ data }: MessageEvent<ArrayBuffer>) =>
        io.writeUTF8(decoder.decode(data, { stream: true }));

      socket.onopen = () => {
        connected = true;
        window.addEventListener('beforeunload', keepOnPage);
        println(`Connected to remote shell for taskId: ${taskId}`);
        terminal.installKeyboard();
        io.onTerminalResize(
          terminal.screenSize.width,
          terminal.screenSize.height
        );
      };

      socket.onclose = () => {
        window.removeEventListener('beforeunload', keepOnPage);
        println(
          connected
            ? '\r\nRemote shell closed'
            : 'Could not connect to remote shell'
        );
        terminal.uninstallKeyboard();
        terminal.setCursorVisible(false);
      };
    };

    if (node) {
      terminal.decorate(node);
    }

    return () => {
      disposed = true;
      window.removeEventListener('beforeunload', keepOnPage);

      if (ws) {
        ws.onclose = null;
        ws.onmessage = null;
        ws.close();
      }

      node?.replaceChildren();
    };
  }, [url, version, taskId]);

  return (
    <Box
      ref={ref}
      sx={{ position: 'absolute', height: '100%', width: '100%' }}
    />
  );
}
