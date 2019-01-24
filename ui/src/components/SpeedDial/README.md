```js
const SpeedDialAction = require('../SpeedDialAction').default;
const HexagonMultipleIcon = require('mdi-react/HexagonMultipleIcon');
const HumanIcon = require('mdi-react/HumanIcon');

<div style={{ height: 200, width: '100%', position: 'relative' }}>
  <SpeedDial style={{ position: 'absolute' }}>
    <SpeedDialAction
      icon={<HexagonMultipleIcon />}
      tooltipTitle="Hexagons!"
      onClick={() => alert('Hexagons!')}
    />
    <SpeedDialAction
      icon={<HumanIcon />}
      tooltipTitle="Humans!"
      onClick={() => alert('Humans!')}
    />
  </SpeedDial>
</div>
```
