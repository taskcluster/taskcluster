Standard sizes:

```js
['error', 'success', 'warning', 'default', 'info'].map(label => (
  <span key={label}>
    <Label status={label}>{label}</Label>{' '}
  </span>
))
```

Mini:

```js
['error', 'success', 'warning', 'default', 'info'].map(label => (
  <span key={label}>
    <Label mini status={label}>{label}</Label>{' '}
  </span>
))
```
