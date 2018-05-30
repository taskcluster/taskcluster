```js
const data = {
  hello: 'world!',
  arr: [
    'alpha',
    'beta',
    'gamma',
  ],
};

<CodeEditor
  options={{ mode: 'json' }}
  value={JSON.stringify(data, null, 2)}
/>
```
