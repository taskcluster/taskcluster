import { useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { json, jsonParseLinter } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import { Prec } from '@codemirror/state';
import { linter, lintGutter } from '@codemirror/lint';
import { EditorView } from '@codemirror/view';
import theme from './theme';
import yamlLinter from './yaml-lint';

const sizing = EditorView.theme({ '&': { fontSize: '13px', height: '100%' } });
const basicSetup = {
  closeBrackets: false,
  autocompletion: false,
  searchKeymap: false,
  highlightSelectionMatches: false,
  foldGutter: false,
};
const languages = {
  json: { language: json(), linter: jsonParseLinter() },
  yaml: { language: yaml(), linter: yamlLinter },
};

export interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  mode: 'json' | 'yaml' | 'text';
  lint?: boolean;
  placeholder?: string;
  className?: string;
}

export default function CodeEditor({
  value,
  onChange,
  mode,
  lint = false,
  placeholder,
  className,
}: CodeEditorProps) {
  const extensions = useMemo(() => {
    if (mode === 'text') {
      return [sizing];
    }

    const lang = languages[mode];

    return lint
      ? [sizing, lang.language, linter(lang.linter), Prec.highest(lintGutter())]
      : [sizing, lang.language];
  }, [mode, lint]);

  return (
    <CodeMirror
      className={className}
      value={value}
      onChange={onChange}
      extensions={extensions}
      theme={theme}
      placeholder={placeholder}
      basicSetup={basicSetup}
      indentWithTab={false}
    />
  );
}
