declare module 'hterm-umdjs' {
  namespace hterm {
    let defaultStorage: unknown;
    let openUrl: (url: string) => void;
    let notify: () => void;

    interface IO {
      writeUTF8(data: string): void;
      sendString: (data: string) => void;
      onVTKeystroke: (data: string) => void;
      onTerminalResize: (width: number, height: number) => void;
    }

    class Terminal {
      constructor(profileId?: string);
      io: IO;
      vt: { characterEncoding: 'utf-8' | 'raw' };
      keyboard: { characterEncoding: 'utf-8' | 'raw' };
      prefs_: { set(name: string, value: unknown): void };
      screenSize: { width: number; height: number };
      onTerminalReady: () => void;
      decorate(node: HTMLElement): void;
      installKeyboard(): void;
      uninstallKeyboard(): void;
      setCursorPosition(row: number, column: number): void;
      setCursorVisible(visible: boolean): void;
      setScrollbarVisible(visible: boolean): void;
      setWindowTitle(title: string): void;
    }
  }

  namespace lib {
    namespace Storage {
      class Local {}
    }
  }

  export { hterm, lib };
}
