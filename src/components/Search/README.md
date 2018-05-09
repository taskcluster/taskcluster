```js
initialState = { value: '' };

<Search
  value={state.value}
  onChange={e => setState({ value: e.target.value })}
  onSubmit={e => {
    e.preventDefault();
    alert(state.value);
  }}
/>
```