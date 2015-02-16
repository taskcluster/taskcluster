import os
import json

readmeFile = os.environ.get('README_FILE', 'README.md')
startDocs = '<!-- START OF GENERATED DOCS -->' 
endDocs = '<!-- END OF GENERATED DOCS -->' 

def docApi(name, ref):
  instName = ''.join((name[0].lower(), name[1:]))
  lines = [
    '### Methods in `taskcluster.%s`' % name,
    '```python',
    '// Create %s client instance' % name,
    'import taskcluster',
    '%s = taskcluster.%s(options)' % (instName, name),
    '```',
  ]
  entries = ref['entries']
  for function in [x for x in entries if x['type'] == 'function']:
    methodName = function['name']
    args = function['args']
    hasOutput = not not function.get('output', False)

    # Input parameters in *args form
    hasInput = not not function.get('input', False)
    inArgs = ''
    inKwargs = ''
    inArgs = ', '.join(args)
    inKwargs = ', '.join(["%s='value'" % x for x in args])
    if hasInput:
      inArgs = inArgs + ', payload' if len(args) > 0 else 'payload'
      inKwargs = ('payload, ' if len(args) > 0 else 'payload') + inKwargs

    outStr = 'result' if hasOutput else 'None'

    lines.append(' * `%s.%s(%s) -> %s`' % (instName, methodName, inArgs, outStr))

    if len(args) > 0:
      lines.append(' * `%s.%s(%s) -> %s`' % (instName, methodName, inKwargs, outStr))


  return lines

def genDocs(apiFile):
  with open(apiFile) as f:
    api = json.load(f)
  lines = [startDocs]
  for apiName, apiRef in api.items():
    lines.extend(docApi(apiName, apiRef['reference'])) 
    lines.append('\n')

  lines.append(endDocs)
  return lines


if __name__ == '__main__':
  print 'Generating documentation'
  docs = genDocs(os.environ.get('APIS_JSON', 'apis.json'))
  outLines = []
  with open(readmeFile) as f:
    lines = [x.rstrip() for x in f.read().split('\n')]

  print 'Inserting/replacing documentation'
  foundExisting = False
  for i in range(0, len(lines)):
    if lines[i] == startDocs:
      outLines.extend(lines[0:i])
      outLines.append('')
      outLines.extend(docs)
      foundExisting = True
    elif lines[i] == endDocs:
      outLines.extend(lines[i+1:])
      break

  if not foundExisting:
    outLines.extend(lines)
    outLines.extend(docs)
  
  with open(readmeFile, 'w') as f:
    f.write('\n'.join(outLines))
  print 'Done!'
