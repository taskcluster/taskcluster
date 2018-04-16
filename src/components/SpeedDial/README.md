```js
const SpeedDialAction = require('@material-ui/lab/SpeedDialAction').default;
const HexagonMultipleIcon = require('mdi-react/HexagonMultipleIcon');
const HumanIcon = require('mdi-react/HumanIcon');

<div style={{ height: 200, width: '100%', position: 'relative' }}>
  <SpeedDial>
    <SpeedDialAction
      key="hexagons"
      icon={<HexagonMultipleIcon />}
      tooltipTitle="Hexagons!"
      onClick={() => alert('Hexagons!')}
    />
    <SpeedDialAction
      key="humans"
      icon={<HumanIcon />}
      tooltipTitle="Humans!"
      onClick={() => alert('Humans!')}
    />
  </SpeedDial>
</div>
```
