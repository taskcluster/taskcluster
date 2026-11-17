import React, { useMemo } from 'react';
import { func, string } from 'prop-types';
import CodeMirror from '@uiw/react-codemirror';
import { json, jsonParseLinter } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import { Prec } from '@codemirror/state';
import { linter, lintGutter } from '@codemirror/lint';
import theme from './theme';
import classNames from 'classnames';
import { makeStyles } from 'tss-react/mui';
import yamlLinter from './yaml-lint';

const useStyles = makeStyles()({
  root: {
    width: '100%',
    '& .cm-editor': {
      fontSize: 13,
      height: '100%',
    },
  },
});
const basicSetup = {
  closeBrackets: false,
  autocompletion: false,
  searchKeymap: false,
  highlightSelectionMatches: false,
};
const languages = {
  json: { language: json(), linter: jsonParseLinter() },
  yaml: { language: yaml(), linter: yamlLinter },
};

export default function CodeEditor({
  value,
  onChange,
  mode = 'json',
  lint = false,
  placeholder,
  className,
}) {
  const { classes } = useStyles();
  const extensions = useMemo(() => {
    const lang = languages[mode];

    if (!lang) {
      return [];
    }

    return lint
      ? [lang.language, linter(lang.linter), Prec.highest(lintGutter())]
      : [lang.language];
  }, [mode, lint]);

  return (
    <CodeMirror
      className={classNames(classes.root, className)}
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

CodeEditor.propTypes = {
  /** Callback function fired when the editor is changed. */
  onChange: func,
  /** The value of the editor. */
  value: string.isRequired,
  /** The CSS class name of the wrapper element */
  className: string,
};
