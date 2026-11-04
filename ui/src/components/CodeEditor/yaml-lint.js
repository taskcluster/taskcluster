import CodeMirror from 'codemirror';
import 'codemirror/addon/lint/lint';
import { loadOptionalDocument } from '../../utils/yamlSchema';

/*
  Override 'codemirror/addon/lint/yaml-lint' registerHelper
  so that it doesn't use window.jsyaml
  https://github.com/codemirror/CodeMirror/blob/master/addon/lint/yaml-lint.js
 */
CodeMirror.registerHelper('lint', 'yaml', text => {
  try {
    loadOptionalDocument(text);
  } catch (e) {
    const { line, column } = e.mark ?? { line: 0, column: 0 };

    return [
      {
        from: CodeMirror.Pos(line, column),
        to: CodeMirror.Pos(line, column),
        message: e.message,
      },
    ];
  }
});
