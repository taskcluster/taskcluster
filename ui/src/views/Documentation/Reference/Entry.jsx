import React, { Component, Fragment } from 'react';
import { withRouter } from 'react-router-dom';
import classNames from 'classnames';
import { oneOf, object, string } from 'prop-types';
import { upperCase } from 'change-case';
import { toString } from 'ramda';
import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import ExpansionPanel from '@material-ui/core/ExpansionPanel';
import ExpansionPanelSummary from '@material-ui/core/ExpansionPanelSummary';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import Grid from '@material-ui/core/Grid';
import ExpansionPanelDetails from '@material-ui/core/ExpansionPanelDetails';
import DataTable from '../../../components/DataTable';
import Markdown from '../../../components/Markdown';
import StatusLabel from '../../../components/StatusLabel';
import SchemaTable from '../../../components/SchemaTable';

const primaryTypographyProps = { variant: 'body1' };

@withRouter
@withStyles(
  theme => ({
    expansionPanelSummaryContent: {
      display: 'flex',
      justifyContent: 'space-between',
      '& div:first-child': {
        flex: 1,
      },
      '& div:nth-child(2)': {
        flex: 1,
      },
    },
    expansionPanelSummary: {
      margin: 0,
    },
    list: {
      width: '100%',
    },
    routingKeyCell: {
      '& span:not(:first-child)': {
        marginLeft: theme.spacing.unit / 2,
      },
    },
    summaryCell: {
      whiteSpace: 'normal',
    },
    gridContainer: {
      '& > div': {
        margin: 'auto',
      },
    },
    boxTop: {
      display: 'inline-block',
      padding: `0 ${theme.spacing.unit / 2}px 0 0`,
    },
    subScopeBox: {
      borderLeft: '1px solid #888',
      padding: '2px 10px',
      paddingLeft: 24,
    },
    scopeItself: {
      margin: `${theme.spacing.unit}px 0`,
    },
    statusLabel: {
      display: 'block',
      fontSize: '0.6rem',
      margin: `${theme.spacing.unit}px 0 ${theme.spacing.unit}px ${-theme
        .spacing.double}px`,
    },
    functionStatusLabel: {
      textAlign: 'center',
    },
    scopesWrapper: {
      padding: theme.spacing.triple,
    },
  }),
  { withTheme: true }
)
export default class Entry extends Component {
  static propTypes = {
    /** Entry type. */
    type: oneOf(['function', 'topic-exchange', 'logs']).isRequired,
    /** The reference entry. */
    entry: object.isRequired,
    /** Required when `type` is `topic-exchange`. */
    exchangePrefix: string,
    /** The service name in which the entry belongs to. */
    serviceName: string.isRequired,
  };

  static defaultProps = {
    exchangePrefix: null,
  };

  state = {
    expanded: this.props.entry.name === window.location.hash.slice(1),
  };

  getSignatureFromEntry(entry) {
    const parameters = entry.query.length
      ? entry.args.concat(`{${entry.query.join(', ')}}`)
      : entry.args;

    return `${entry.name}(${parameters.join(', ')}) : ${
      entry.output ? 'result' : 'void'
    }`;
  }

  renderFunctionExpansionPanelSummary = () => {
    const { entry, classes } = this.props;
    const signature = this.getSignatureFromEntry(entry);

    return (
      <Grid className={classes.gridContainer} container spacing={8}>
        <Grid item xs={6}>
          <div>
            <Typography id={entry.name} component="h3">
              {signature}
            </Typography>
          </div>
        </Grid>
        <Grid item xs={4}>
          <div>
            <Typography>{entry.title}</Typography>
          </div>
        </Grid>
        <Grid item xs={2}>
          <div className={classes.functionStatusLabel}>
            <StatusLabel state={upperCase(entry.stability)} />
          </div>
        </Grid>
      </Grid>
    );
  };

  renderExchangeExpansionPanelSummary = () => {
    const { entry, classes } = this.props;

    return (
      <Grid className={classes.gridContainer} container spacing={8}>
        <Grid item xs={5}>
          <div>
            <Typography id={entry.name} component="h3">
              {entry.exchange}
            </Typography>
          </div>
        </Grid>
        <Grid item xs={7}>
          <div>
            <Typography>{entry.title}</Typography>
          </div>
        </Grid>
      </Grid>
    );
  };

  renderLogsExpansionPanelSummary = () => {
    const { entry, classes } = this.props;

    return (
      <Grid className={classes.gridContainer} container spacing={8}>
        <Grid item xs={3}>
          <div>
            <Typography id={entry.type} component="h3">
              {entry.type}
            </Typography>
          </div>
        </Grid>
        <Grid item xs={1}>
          <div>
            <Typography component="h3">v{entry.version}</Typography>
          </div>
        </Grid>
        <Grid item xs={8}>
          <div>
            <Typography>{entry.description}</Typography>
          </div>
        </Grid>
      </Grid>
    );
  };

  renderSchemaTable = (schema, headerTitle) => {
    const { serviceName } = this.props;

    return (
      <ListItem>
        <ListItemText
          primaryTypographyProps={primaryTypographyProps}
          disableTypography
          primary={<Typography variant="body1">{headerTitle}</Typography>}
          secondary={
            <Fragment>
              <br />
              <SchemaTable schema={schema} serviceName={serviceName} />
            </Fragment>
          }
        />
      </ListItem>
    );
  };

  renderScopeExpression(scopes) {
    const { classes } = this.props;

    if (typeof scopes === 'string') {
      return (
        <div>
          <code className={classes.scopeItself}>{scopes}</code>
        </div>
      );
    }

    if (['if', 'then'].every(prop => prop in scopes)) {
      return (
        <Fragment>
          <Typography className={classes.boxTop} component="span">
            if{' '}
            <strong>
              <em>{scopes.if}</em>
            </strong>
          </Typography>
          <div className={classes.subScopeBox}>
            {this.renderScopeExpression(scopes.then)}
          </div>
          {scopes.else && (
            <Fragment>
              <Typography className={classes.boxTop} component="span">
                else
              </Typography>
              <div className={classes.subScopeBox}>
                {this.renderScopeExpression(scopes.else)}
              </div>
            </Fragment>
          )}
        </Fragment>
      );
    }

    if (['for', 'each', 'in'].every(prop => prop in scopes)) {
      return (
        <Fragment>
          <Typography className={classes.boxTop} component="span">
            for each{' '}
            <strong>
              <em>{scopes.for}</em>
            </strong>
          </Typography>
          <Typography className={classes.boxTop} component="span">
            in{' '}
            <strong>
              <em>{scopes.in}</em>
            </strong>
          </Typography>
          <div className={classes.subScopeBox}>
            {this.renderScopeExpression(scopes.each)}
          </div>
        </Fragment>
      );
    }

    if (['AllOf', 'AnyOf'].some(prop => prop in scopes)) {
      const operator = Object.keys(scopes)[0];

      return (
        <Fragment>
          <Typography className={classes.boxTop} component="span">
            {'AllOf' in scopes ? 'all of' : 'any of'}
          </Typography>
          <div className={classes.subScopeBox}>
            {scopes[operator].map((scope, index) => (
              <Fragment key={toString(scope)}>
                {this.renderScopeExpression(scope)}
                {index < scopes[operator].length - 1 && (
                  <StatusLabel
                    className={classes.statusLabel}
                    mini
                    state={upperCase('AllOf' in scopes ? 'and' : 'or')}
                  />
                )}
              </Fragment>
            ))}
          </div>
        </Fragment>
      );
    }
  }

  renderFunctionExpansionDetails = () => {
    const { classes, entry } = this.props;
    const signature = this.getSignatureFromEntry(entry);

    return (
      <List className={classes.list}>
        <ListItem>
          <ListItemText
            primaryTypographyProps={primaryTypographyProps}
            primary="Method"
            secondary={<StatusLabel state={upperCase(entry.method)} />}
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primaryTypographyProps={primaryTypographyProps}
            primary="Route"
            secondary={entry.route}
          />
        </ListItem>
        {entry.scopes && (
          <ListItem>
            <ListItemText
              primaryTypographyProps={primaryTypographyProps}
              secondaryTypographyProps={{
                className: classes.scopesWrapper,
                component: 'div',
              }}
              primary="Scopes"
              secondary={this.renderScopeExpression(entry.scopes)}
            />
          </ListItem>
        )}
        <ListItem>
          <ListItemText
            primaryTypographyProps={primaryTypographyProps}
            primary="Signature"
            secondary={signature}
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primaryTypographyProps={primaryTypographyProps}
            primary="Stability"
            secondary={<StatusLabel state={upperCase(entry.stability)} />}
          />
        </ListItem>
        {entry.description ? (
          <ListItem>
            <ListItemText
              primaryTypographyProps={primaryTypographyProps}
              primary="Description"
              secondary={<Markdown>{entry.description}</Markdown>}
            />
          </ListItem>
        ) : (
          <ListItem>
            <ListItemText
              primaryTypographyProps={primaryTypographyProps}
              primary="Description"
              secondary="n/a"
            />
          </ListItem>
        )}
        {entry.input && this.renderSchemaTable(entry.input, 'Request Payload')}
        {entry.output &&
          this.renderSchemaTable(entry.output, 'Response Payload')}
      </List>
    );
  };

  renderExchangeExpansionDetails = () => {
    const { classes, entry, exchangePrefix } = this.props;
    const { expanded } = this.state;
    const exchange = `${exchangePrefix}${entry.exchange}`;

    return (
      expanded && (
        <List className={classes.list}>
          <ListItem>
            <ListItemText
              primaryTypographyProps={primaryTypographyProps}
              primary="Exchange"
              secondary={exchange}
            />
          </ListItem>
          {entry.description ? (
            <ListItem>
              <ListItemText
                primaryTypographyProps={primaryTypographyProps}
                primary="Description"
                secondary={<Markdown>{entry.description}</Markdown>}
              />
            </ListItem>
          ) : (
            <ListItem>
              <ListItemText
                primaryTypographyProps={primaryTypographyProps}
                primary="Description"
                secondary="n/a"
              />
            </ListItem>
          )}
          <ListItem>
            <ListItemText
              primaryTypographyProps={primaryTypographyProps}
              primary="Routing Keys"
              secondary={
                <DataTable
                  headers={['Index', 'Name', 'Summary', '']}
                  items={entry.routingKey}
                  renderRow={(routingKey, idx) => (
                    <TableRow key={routingKey.name}>
                      <TableCell>
                        <Typography>{idx}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography>{routingKey.name}</Typography>
                      </TableCell>
                      <TableCell className={classes.summaryCell}>
                        <Markdown>{routingKey.summary}</Markdown>
                      </TableCell>
                      <TableCell className={classes.routingKeyCell}>
                        {routingKey.constant && (
                          <span
                            title={`This key always assume the value ${
                              routingKey.constant
                            }. Used to allow additional routing key formats.`}>
                            <StatusLabel state="CONSTANT_KEY" />
                          </span>
                        )}
                        {routingKey.required && (
                          <span title="This key takes the value of `_`, if it does not make sense for the event reported.">
                            <StatusLabel state="OPTION_KEY" />
                          </span>
                        )}
                        {routingKey.multipleWords && (
                          <span title="This key may container dots `.`, creating multiple sub-keys, match it with `#`">
                            <StatusLabel state="MULTI_KEY" />
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                />
              }
            />
          </ListItem>
          {entry.schema &&
            this.renderSchemaTable(entry.schema, 'Message Payload')}
        </List>
      )
    );
  };

  renderLogsExpansionDetails = () => {
    const { classes, entry } = this.props;
    const { expanded } = this.state;

    return (
      expanded && (
        <List className={classes.list}>
          <ListItem>
            <ListItemText
              primaryTypographyProps={primaryTypographyProps}
              primary="Fields"
              secondary={
                <DataTable
                  items={Object.keys(entry.fields)}
                  renderRow={field => (
                    <TableRow key={field}>
                      <TableCell>
                        <Typography>{field}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography>{entry.fields[field]}</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                />
              }
            />
          </ListItem>
        </List>
      )
    );
  };

  handlePanelChange = () => {
    const { entry, history } = this.props;
    const { expanded } = this.state;

    if (window.location.hash === `#${entry.name}` || expanded) {
      history.push(history.location.pathname);
    } else {
      history.push(`#${entry.name}`);
    }

    this.setState({
      expanded: !expanded,
    });
  };

  render() {
    const { classes, type } = this.props;
    const { expanded } = this.state;
    const isEntryExchange = type === 'topic-exchange';
    const isLogType = type === 'logs';
    const isFunctionType = !isLogType && !isEntryExchange;

    return (
      <ExpansionPanel
        defaultExpanded={expanded}
        onChange={this.handlePanelChange}
        CollapseProps={{ unmountOnExit: true }}>
        <ExpansionPanelSummary
          classes={{
            content: classNames(classes.expansionPanelSummary, {
              [classes.expansionPanelSummaryContent]: !isEntryExchange,
            }),
          }}
          expandIcon={<ExpandMoreIcon />}>
          {isEntryExchange && this.renderExchangeExpansionPanelSummary()}
          {isLogType && this.renderLogsExpansionPanelSummary()}
          {isFunctionType && this.renderFunctionExpansionPanelSummary()}
        </ExpansionPanelSummary>
        <ExpansionPanelDetails>
          {isEntryExchange && this.renderExchangeExpansionDetails()}
          {isLogType && this.renderLogsExpansionDetails()}
          {isFunctionType && this.renderFunctionExpansionDetails()}
        </ExpansionPanelDetails>
      </ExpansionPanel>
    );
  }
}
