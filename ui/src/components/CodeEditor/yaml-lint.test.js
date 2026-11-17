import { EditorState } from '@codemirror/state';
import yamlLinter from './yaml-lint';

const lint = doc => yamlLinter({ state: EditorState.create({ doc }) });

it('reports nothing for valid YAMLs', () => {
  expect(lint('a: 1\nb: [2, 3]\n')).toEqual([]);
  expect(lint('')).toEqual([]);
  expect(lint('# only a comment')).toEqual([]);
});

it('reports the error at the position given by js-yaml', () => {
  const doc = 'a: 1\nb: [2, 3\nc: 4\n';
  const [diagnostic] = lint(doc);

  expect(diagnostic).toEqual({
    from: doc.indexOf('c: 4'),
    to: doc.indexOf('c: 4'),
    severity: 'error',
    message: expect.stringMatching(/^deficient indentation \(3:1\)/),
  });
});

it('rejects multiple documents', () => {
  const [diagnostic] = lint('a: 1\n---\nb: 2\n');

  expect(diagnostic.message).toMatch(/single document/);
  expect(diagnostic.from).toBe(0);
});
