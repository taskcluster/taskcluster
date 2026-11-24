import { type Range, StateEffect, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';

type Color = number | string | null;

const DEFAULT_STYLE = {
  fg: null as Color,
  bg: null as Color,
  bold: false,
  italic: false,
  underline: false,
};

type AnsiStyle = typeof DEFAULT_STYLE;

const SGR: Record<number, Partial<AnsiStyle>> = {
  0: DEFAULT_STYLE,
  1: { bold: true },
  3: { italic: true },
  4: { underline: true },
  22: { bold: false },
  23: { italic: false },
  24: { underline: false },
  39: { fg: null },
  49: { bg: null },
};
const CSI = String.raw`\[([0-?]*)[ -/]*([@-~])`;
const OSC = String.raw`\][^\x07\x1b\n]*(?:\x07|\x1b\\|(?=\n|$))`;
// `ESC7`, `ESC=`, `ESC(B` (`tput sgr0`)
const SHORT = String.raw`[ -/]*[0-Z\\^-~]`;
const ESCAPE = new RegExp(String.raw`\x1b(?:${CSI}|${OSC}|${SHORT})`, 'g');

const cssColor = (color: number | string) =>
  typeof color === 'number' ? `var(--log-ansi-${color})` : color;

const CUBE_LEVELS = [0, 95, 135, 175, 215, 255];
// See https://github.com/ThomasDickey/xterm-snapshots/blob/master/256colres.pl
const xtermColor = (index: number): Color => {
  // Strings aren't brightened by bold, unlike SGR 30-37
  if (index < 16) {
    return cssColor(index);
  }

  if (index < 232) {
    const i = index - 16;

    return `rgb(${CUBE_LEVELS[Math.floor(i / 36)]}, ${CUBE_LEVELS[Math.floor(i / 6) % 6]}, ${CUBE_LEVELS[i % 6]})`;
  }

  const level = 8 + (index - 232) * 10;
  return `rgb(${level}, ${level}, ${level})`;
};

const toCode = (param: string) => Number.parseInt(param, 10) || 0;
const isByte = (value?: number): boolean => value !== undefined && value <= 255;

const extendedColor = (args: number[]): [Color | undefined, number] => {
  const [mode, ...values] = args;

  if (mode === 5) {
    const [index] = values;
    return [isByte(index) ? xtermColor(index) : undefined, 2];
  }

  if (mode === 2) {
    const [r, g, b] = values;
    const valid = isByte(r) && isByte(g) && isByte(b);
    return [valid ? `rgb(${r}, ${g}, ${b})` : undefined, 4];
  }

  return [undefined, 1];
};

const styleToCss = ({ fg, bg, bold, italic, underline }: AnsiStyle) =>
  [
    fg !== null &&
      `color: ${cssColor(bold && typeof fg === 'number' && fg < 8 ? fg + 8 : fg)}`,
    bg !== null && `background-color: ${cssColor(bg)}`,
    bold && 'font-weight: bold',
    italic && 'font-style: italic',
    underline && 'text-decoration: underline',
  ]
    .filter(Boolean)
    .join('; ');

export class AnsiParser {
  private style = DEFAULT_STYLE;
  private currentDecoration: Decoration | null = null;
  private decorations = new Map<string, Decoration>();

  // `base` is the document offset `text` is added at.
  push(text: string, base: number) {
    const ranges: Range<Decoration>[] = [];
    const parts: string[] = [];
    let length = 0;
    let last = 0;
    const append = (piece: string) => {
      if (!piece) {
        return;
      }

      const from = base + length;
      if (this.currentDecoration) {
        ranges.push(this.currentDecoration.range(from, from + piece.length));
      }

      parts.push(piece);
      length += piece.length;
    };

    const backspace = () => {
      const part = parts.at(-1);
      if (!part || part.endsWith('\n')) {
        return;
      }

      const width = (part.codePointAt(part.length - 2) ?? 0) > 0xffff ? 2 : 1;
      const range = ranges.at(-1);

      if (range?.to === base + length) {
        ranges.pop();

        if (range.to - range.from > width) {
          ranges.push(range.value.range(range.from, range.to - width));
        }
      }

      if (part.length > width) {
        parts[parts.length - 1] = part.slice(0, -width);
      } else {
        parts.pop();
      }

      length -= width;
    };

    const appendText = (piece: string) => {
      if (!piece.includes('\b')) {
        append(piece);
        return;
      }

      const [first, ...rest] = piece.split('\b');
      append(first);

      for (const segment of rest) {
        backspace();
        append(segment);
      }
    };

    for (const match of text.matchAll(ESCAPE)) {
      appendText(text.slice(last, match.index));
      last = match.index + match[0].length;

      // Private sequences like `ESC[>4;2m` (modifyOtherKeys) are not SGR
      if (match[2] === 'm' && /^[\d:;]*$/.test(match[1])) {
        this.applySgr(match[1]);
      }
    }

    appendText(text.slice(last));

    return { text: parts.join(''), ranges };
  }

  private applySgr(params: string) {
    const codes = params.split(';');
    const style = { ...this.style };

    for (let i = 0; i < codes.length; i++) {
      const param = codes[i];
      const code = toCode(param);
      const target = code === 38 ? 'fg' : 'bg';

      if (param.includes(':')) {
        const sub = param.split(':').slice(1).map(toCode);

        if (code === 38 || code === 48) {
          // Drop the color space ID of `2:id:r:g:b`
          const [color] = extendedColor(
            sub[0] === 2 && sub.length > 4 ? [2, ...sub.slice(2)] : sub
          );

          if (color !== undefined) {
            style[target] = color;
          }
        } else if (code === 4) {
          style.underline = sub[0] !== 0;
        }
      } else if (code in SGR) {
        Object.assign(style, SGR[code]);
      } else if (code >= 30 && code <= 37) {
        style.fg = code - 30;
      } else if (code >= 40 && code <= 47) {
        style.bg = code - 40;
      } else if (code >= 90 && code <= 97) {
        style.fg = code - 90 + 8;
      } else if (code >= 100 && code <= 107) {
        style.bg = code - 100 + 8;
      } else if (code === 38 || code === 48 || code === 58) {
        const [color, used] = extendedColor(
          codes.slice(i + 1, i + 5).map(toCode)
        );

        // Underline colors (58) are not supported, skip 'em
        if (color !== undefined && code !== 58) {
          style[target] = color;
        }

        i += used;
      }
    }

    const css = styleToCss(style);

    if (css && !this.decorations.has(css)) {
      this.decorations.set(
        css,
        Decoration.mark({ attributes: { style: css } })
      );
    }

    this.style = style;
    this.currentDecoration = this.decorations.get(css) ?? null;
  }
}

export const addColors = StateEffect.define<readonly Range<Decoration>[]>();

export const ansiColors = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update: (colors, tr) =>
    tr.effects.reduce(
      (colors, effect) =>
        effect.is(addColors) ? colors.update({ add: effect.value }) : colors,
      colors.map(tr.changes)
    ),
  provide: field => EditorView.decorations.from(field),
});
