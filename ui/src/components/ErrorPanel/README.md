String message:

```js
<ErrorPanel error="Something bad happened" />
```

Exception, in development:

```js
<ErrorPanel disableStackTrace={false} error={new Error('Something bad happened')} />
```

Error with markdown:

```js
<ErrorPanel error="[Markdown](#) is also `supported`."/>
```

Warning styling:

```js
<ErrorPanel warning error="Something bad happened" />
```

Warning with markdown:

```js
<ErrorPanel warning error="[Markdown](#) is also `supported`."/>
```
