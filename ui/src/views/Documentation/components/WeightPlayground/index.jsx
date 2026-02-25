import React, { useState } from 'react';
import { withStyles } from '@material-ui/core/styles';
import Table from '@material-ui/core/Table';
import TableHead from '@material-ui/core/TableHead';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import TableBody from '@material-ui/core/TableBody';
import TextField from '@material-ui/core/TextField';
import LinearProgress from '@material-ui/core/LinearProgress';
import IconButton from '@material-ui/core/IconButton';
import Button from '@material-ui/core/Button';
import Typography from '@material-ui/core/Typography';
import DeleteIcon from 'mdi-react/DeleteIcon';
import PlusIcon from 'mdi-react/PlusIcon';
import computeWeightDistribution from './utils';

const styles = theme => ({
  root: {
    marginTop: theme.spacing(2),
    marginBottom: theme.spacing(4),
    overflowX: 'auto',
  },
  addButton: {
    marginTop: theme.spacing(2),
  },
  progress: {
    height: 10,
    borderRadius: 5,
    minWidth: 80,
    '& .MuiLinearProgress-barColorPrimary': {
      backgroundColor:
        theme.palette.type === 'dark'
          ? theme.palette.primary.light
          : theme.palette.primary.dark,
    },
  },
  naText: {
    color: theme.palette.text.disabled,
  },
  weightInput: {
    width: 80,
  },
});
const DEFAULT_CONFIGS = [
  { id: 1, weight: 1.0 },
  { id: 2, weight: 0.5 },
  { id: 3, weight: 0.1 },
];
let nextId = DEFAULT_CONFIGS.length + 1;

function WeightPlayground({ classes }) {
  const [configs, setConfigs] = useState(DEFAULT_CONFIGS);
  const distributedConfigs = computeWeightDistribution(configs);
  const handleWeightChange = (id, value) => {
    const parsed = parseFloat(value);
    const weight = Number.isNaN(parsed) || parsed < 0 ? 0 : Math.min(parsed, 1);

    setConfigs(prev => prev.map(c => (c.id === id ? { ...c, weight } : c)));
  };

  const handleAdd = () => {
    // eslint-disable-next-line no-plusplus
    setConfigs(prev => [...prev, { id: nextId++, weight: 1.0 }]);
  };

  const handleRemove = id => {
    setConfigs(prev => prev.filter(c => c.id !== id));
  };

  return (
    <div className={classes.root}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Config ID</TableCell>
            <TableCell>Weight</TableCell>
            <TableCell>% Share</TableCell>
            <TableCell>Workers (of 1000)</TableCell>
            <TableCell>Distribution</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {distributedConfigs.map((config, index) => {
            const { share, workers } = config;

            return (
              <TableRow key={config.id}>
                <TableCell>
                  <Typography variant="body2">config-{index + 1}</Typography>
                </TableCell>
                <TableCell>
                  <TextField
                    className={classes.weightInput}
                    type="number"
                    value={config.weight}
                    onChange={e =>
                      handleWeightChange(config.id, e.target.value)
                    }
                    inputProps={{ min: 0, max: 1, step: 0.1 }}
                    size="small"
                    variant="outlined"
                  />
                </TableCell>
                <TableCell>
                  {share !== null ? (
                    `${share.toFixed(1)}%`
                  ) : (
                    <span className={classes.naText}>N/A</span>
                  )}
                </TableCell>
                <TableCell>
                  {workers !== null ? (
                    workers
                  ) : (
                    <span className={classes.naText}>N/A</span>
                  )}
                </TableCell>
                <TableCell>
                  {share !== null ? (
                    <LinearProgress
                      className={classes.progress}
                      variant="determinate"
                      value={share}
                    />
                  ) : (
                    <span className={classes.naText}>N/A</span>
                  )}
                </TableCell>
                <TableCell>
                  <IconButton
                    size="small"
                    onClick={() => handleRemove(config.id)}
                    disabled={configs.length === 1}
                    aria-label="remove config">
                    <DeleteIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <Button
        className={classes.addButton}
        variant="outlined"
        size="small"
        onClick={handleAdd}
        startIcon={<PlusIcon />}>
        Add Config
      </Button>
    </div>
  );
}

export default withStyles(styles)(WeightPlayground);
