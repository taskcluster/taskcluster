import type { Diagnostic } from '@codemirror/lint';
import type { EditorState } from '@codemirror/state';
import type { YAMLException } from 'js-yaml';
import { loadOptionalDocument } from '../../utils/yamlSchema';

export default function yamlLinter({
  state,
}: {
  state: EditorState;
}): Diagnostic[] {
  try {
    loadOptionalDocument(state.doc.toString());
  } catch (e) {
    const { mark, message } = e as YAMLException;
    const pos = mark?.position ?? 0;

    return [{ from: pos, to: pos, severity: 'error', message }];
  }

  return [];
}
