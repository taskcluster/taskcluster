import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { withStyles } from '@material-ui/core/styles';
import { equals } from 'ramda';
import { scopeUnion, scopeIntersection } from 'taskcluster-lib-scopes';
import CodeEditor from '@mozilla-frontend-infra/components/CodeEditor';
import Grid from '@material-ui/core/Grid';
import Typography from '@material-ui/core/Typography';
import ScaleBalanceIcon from 'mdi-react/ScaleBalanceIcon';
import { parse, stringify } from 'qs';
import Dashboard from '../../../components/Dashboard/index';
import Button from '../../../components/Button/index';
import splitLines from '../../../utils/splitLines';

const getScopesetDiff = (scopesA, scopesB) => {
  const scopesUnion = scopeUnion(scopesA, scopesB);
  const scopesetDiff = [];

  scopesUnion.forEach(scope => {
    const s1 = scopeIntersection([scope], scopesA);
    const s2 = scopeIntersection([scope], scopesB);

    scopesetDiff.push([s1, s2]);
  });

  return scopesetDiff;
};

const getCellColors = scopesetDiff => {
  const cellColors = [];

  scopesetDiff.forEach(([s1, s2]) => {
    if (s1.length === 0 && s2.length) {
      cellColors.push(['', 'greenCell']);
    } else if (s1.length && s2.length === 0) {
      cellColors.push(['redCell', '']);
    } else if (!equals(s1, s2)) {
      cellColors.push(['yellowCell', 'yellowCell']);
    } else {
      cellColors.push(['', '']);
    }
  });

  return cellColors;
};

@hot(module)
@withStyles(theme => ({
  actionButton: {
    ...theme.mixins.fab,
  },
  listItemButton: {
    ...theme.mixins.listItemButton,
  },
  redCell: {
    backgroundColor: 'rgba(255, 0, 0, 0.25)',
  },
  greenCell: {
    backgroundColor: 'rgba(0, 255, 0, 0.25)',
  },
  yellowCell: {
    backgroundColor: 'rgba(255, 255, 0, 0.25)',
  },
  editorGrid: {
    marginBottom: theme.spacing(1),
  },
  cellGrid: {
    padding: `0 ${theme.spacing(1)}px`,
  },
}))
export default class ScopesetComparison extends Component {
  constructor(props) {
    super(props);

    const query = parse(this.props.location.search.slice(1));
    const { scopesA, scopesB } = query;

    if (scopesA && scopesB) {
      const scopesetDiff = getScopesetDiff(scopesA, scopesB);
      const cellColors = getCellColors(scopesetDiff);

      this.state = {
        scopeTextA: scopesA.join('\n'),
        scopeTextB: scopesB.join('\n'),
        scopesetDiff,
        cellColors,
      };
    } else {
      this.state = {
        scopeTextA: '',
        scopeTextB: '',
      };
    }
  }

  handleScopesAChange = scopeTextA => {
    this.setState({ scopeTextA });
  };

  handleScopesBChange = scopeTextB => {
    this.setState({ scopeTextB });
  };

  handleCompareScopesClick = async () => {
    const { scopeTextA, scopeTextB } = this.state;

    if (scopeTextA && scopeTextB) {
      const scopesA = splitLines(scopeTextA);
      const scopesB = splitLines(scopeTextB);
      const scopesetDiff = getScopesetDiff(scopesA, scopesB);
      const cellColors = getCellColors(scopesetDiff);
      const queryObj = { scopesA, scopesB };
      const queryStr = stringify(queryObj);

      this.props.history.push({
        pathname: '/auth/scopes/compare',
        search: queryStr,
      });

      this.setState({ scopesetDiff, cellColors });
    }
  };

  render() {
    const { classes } = this.props;
    const { scopeTextA, scopeTextB, scopesetDiff, cellColors } = this.state;

    return (
      <Dashboard title="Compare Scopes">
        <Fragment>
          <Grid className={classes.editorGrid} container spacing={1}>
            <Grid item xs={12} md={6}>
              <Typography gutterBottom variant="subtitle1">
                Scope A
              </Typography>
              <CodeEditor
                className={classes.editor}
                onChange={this.handleScopesAChange}
                placeholder="new-scope:for-something:*"
                mode="scopemode"
                value={scopeTextA}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography gutterBottom variant="subtitle1">
                Scope B
              </Typography>
              <CodeEditor
                className={classes.editor}
                onChange={this.handleScopesBChange}
                placeholder="new-scope:for-something:*"
                mode="scopemode"
                value={scopeTextB}
              />
            </Grid>
          </Grid>
          {scopesetDiff && cellColors && (
            <Fragment>
              {scopesetDiff.map((scopes, index) => (
                <Grid key={scopes} container>
                  <Grid item xs={6} className={classes[cellColors[index][0]]}>
                    {scopes[0].length > 0 &&
                      scopes[0].map(scope => (
                        <Typography
                          key={scope}
                          variant="body2"
                          className={classes.cellGrid}>
                          {scope}
                        </Typography>
                      ))}
                  </Grid>
                  <Grid item xs={6} className={classes[cellColors[index][1]]}>
                    {scopes[1].length > 0 &&
                      scopes[1].map(scope => (
                        <Typography
                          key={scope}
                          variant="body2"
                          className={classes.cellGrid}>
                          {scope}
                        </Typography>
                      ))}
                  </Grid>
                </Grid>
              ))}
            </Fragment>
          )}
          <Button
            spanProps={{ className: classes.actionButton }}
            tooltipProps={{ title: 'Compare Scopes' }}
            color="secondary"
            variant="round"
            onClick={this.handleCompareScopesClick}>
            <ScaleBalanceIcon />
          </Button>
        </Fragment>
      </Dashboard>
    );
  }
}
