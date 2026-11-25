import type { Diagnostic } from '@codemirror/lint';
import type { EditorView } from '@codemirror/view';
import type { YAMLException } from 'js-yaml';
import { loadOptionalDocument } from '../../utils/yamlSchema';

export default function yamlLinter(view: EditorView): Diagnostic[] {
  const { doc } = view.state;

  try {
    loadOptionalDocument(doc.toString());
  } catch (e) {
    const { mark, message } = e as YAMLException;
    const pos = mark?.position ?? 0;

    return [{ from: pos, to: pos, severity: 'error', message }];
  }

  return [];
}
