import { loadOptionalDocument } from '../../utils/yamlSchema';

export default function yamlLinter(view) {
  const { doc } = view.state;

  try {
    loadOptionalDocument(doc.toString());
  } catch (e) {
    const pos = e.mark?.position ?? 0;

    return [{ from: pos, to: pos, severity: 'error', message: e.message }];
  }

  return [];
}
