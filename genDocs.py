from __future__ import absolute_import, division, print_function, \
    unicode_literals
import os
import json
import six

readmeFile = os.environ.get('README_FILE', 'README.md')
startDocs = '<!-- START OF GENERATED DOCS -->'
endDocs = '<!-- END OF GENERATED DOCS -->'


def docApi(name, ref):
    instName = ''.join((name[0].lower(), name[1:]))
    asyncName = 'async' + name
    entries = ref['entries']
    functions = [x for x in entries if x['type'] == 'function']
    exchanges = [x for x in entries if x['type'] == 'topic-exchange']
    lines = []

    if len(functions) > 0:
        lines.extend([
            '',
            '### Methods in `taskcluster.%s`' % name,
            '```python',
            'import asyncio # Only for async ',
            '// Create %s client instance' % name,
            'import taskcluster',
            'import taskcluster.async',
            '',
            '%s = taskcluster.%s(options)' % (instName, name),
            '# Below only for async instances, assume already in coroutine',
            'loop = asyncio.get_event_loop()',
            'session = taskcluster.async.createSession(loop=loop)',
            '%s = taskcluster.async.%s(options, session=session)' % (asyncName, name),
            '```',
        ])
        if ref.get('description'):
            lines.extend(ref['description'].split('\n'))

    for function in functions:
        methodName = function['name']
        args = function['args']
        hasOutput = not not function.get('output', False)

        # Input parameters in *args form
        hasInput = not not function.get('input', False)
        inArgs = ''
        inKwargs = ''
        inArgs = ', '.join(args)
        inKwargs = ', '.join([u"%s='value'" % x for x in args])
        if hasInput:
            inArgs = inArgs + ', payload' if len(args) > 0 else 'payload'
            inKwargs = ('payload, ' if len(args) > 0 else 'payload') + inKwargs

        outStr = 'result' if hasOutput else 'None'

        lines.append('#### %s' % function['title'])

        if function.get('description'):
            lines.extend(function['description'].split('\n'))
            lines.append('')
            lines.append('')

        if len(args) >0:
            lines.extend([
                '',
                'Takes the following arguments:',
                '',
            ])
            lines.extend(['  * `' + x + '`' for x in args])
            lines.append('')

        if hasInput:
            lines.append('Required [input schema](%s)' % function.get('input'))
            lines.append('')
        if hasOutput:
            lines.append('Required [output schema](%s)' % function.get('output'))
            lines.append('')

        lines.append('```python')
        lines.append('# Sync calls')
        lines.append('%s.%s(%s) # -> %s`' % (instName, methodName, inArgs, outStr))
        if len(args) > 0:
            lines.append('%s.%s(%s) # -> %s' % (instName, methodName, inKwargs, outStr))
        lines.append('# Async call')
        lines.append('await %s.%s(%s) # -> %s' % (asyncName, methodName, inArgs, outStr))
        if len(args) > 0:
            lines.append('await %s.%s(%s) # -> %s' % (asyncName, methodName, inKwargs, outStr))
        lines.append('```')

        lines.append('')

    if len(exchanges) > 0:
        lines.extend([
            '',
            '### Exchanges in `taskcluster.%s`' % name,
            '```python',
            '// Create %s client instance' % name,
            'import taskcluster',
            '%s = taskcluster.%s(options)' % (instName, name),
            '```',
        ])
        if ref.get('description'):
            lines.extend(ref['description'].split('\n'))

    for exchange in exchanges:
        lines.append('#### %s' % exchange['title'])
        lines.append(' * `%s.%s(routingKeyPattern) -> routingKey`' % (instName, exchange['name']))
        for key in exchange['routingKey']:
            lines.append('   * `%s`%s%s Description: %s' % (
                key['name'],
                ' is constant of `%s` ' % key['constant'] if 'constant' in key else '',
                ' is required ' if key.get('required') else '',
                key['summary'],
            ))

        lines.append('')

    return lines


def genDocs(apiFile):
    with open(apiFile) as f:
        api = json.load(f)
    lines = [startDocs]
    for apiName, apiRef in sorted(api.items()):
        lines.extend(docApi(apiName, apiRef['reference']))
        lines.append('\n')

    lines.append(endDocs)
    return lines


if __name__ == '__main__':
    print('Generating documentation')
    docs = genDocs(os.environ.get('APIS_JSON', 'apis.json'))
    outLines = []
    with open(readmeFile) as f:
        lines = [x.rstrip() for x in f.read().split('\n')]

    print('Inserting/replacing documentation')
    foundExisting = False
    for i in range(0, len(lines)):
        if lines[i] == startDocs:
            outLines.extend(lines[0:i])
            outLines.extend(docs)
            foundExisting = True
        elif lines[i] == endDocs:
            outLines.extend(lines[i+1:])
            break

    if not foundExisting:
        outLines.extend(lines)
        outLines.extend(docs)

    with open(readmeFile, 'w') as f:
        if six.PY2:
            f.write('\n'.join(outLines).encode('utf-8'))
        else:
            f.write(u'\n'.join(outLines))
    print('Done!')
