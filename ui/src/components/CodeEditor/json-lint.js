import CodeMirror from 'codemirror';
import { parser } from 'jsonlint-mod';
import 'codemirror/addon/lint/lint';

/*
  Override 'codemirror/addon/lint/json-lint' registerHelper
  so that it doesn't use window.jsonlint
  https://github.com/codemirror/CodeMirror/blob/master/addon/lint/json-lint.js
 */
CodeMirror.registerHelper('lint', 'json', text => {
  const found = [];

  parser.parseError = (str, hash) => {
    const { loc } = hash;

    found.push({
      from: CodeMirror.Pos(loc.first_line - 1, loc.first_column),
      to: CodeMirror.Pos(loc.last_line - 1, loc.last_column),
      message: str,
    });
  };

  try {
    parser.parse(text);
  } catch (e) {
    // Do nothing
  }

  return found;
});
