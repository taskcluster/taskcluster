```js
const tree = [
  {
    value: 'Parent A',
    nodes: [
      { value: 'Child A' },
      { value: 'Child B' },
    ]
  },
  {
    value: 'Parent B',
    nodes: [
      {
        value: 'Child C'
      },
      {
        value: 'Parent C',
        nodes: [
          { value: 'Child D' },
          { value: 'Child E' },
          { value: 'Child F' },
        ]
      },
    ]
  },
];

<Tree onLeafClick={(value) => alert(`${value} clicked`)} tree={tree} />
```