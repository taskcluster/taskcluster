String message:

```js
<ErrorPanel error="Something bad happened" />
```

Exception, in development:

```js
<ErrorPanel error={new Error('Something bad happened')} />
```

Warning styling:

```js
<ErrorPanel warning error="Something bad happened" />
```
