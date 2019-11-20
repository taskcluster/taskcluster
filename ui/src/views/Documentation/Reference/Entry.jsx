import React, { Component, Fragment } from 'react';
import { withRouter } from 'react-router-dom';
import classNames from 'classnames';
import { oneOf, object, string } from 'prop-types';
import { upperCase } from 'change-case';
import { toString, path } from 'ramda';
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
        marginLeft: theme.spacing(0.5),
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
      padding: `0 ${theme.spacing(0.5)}px 0 0`,
    },
    subScopeBox: {
      borderLeft: '1px solid #888',
      padding: '2px 10px',
      paddingLeft: 24,
    },
    scopeItself: {
      margin: `${theme.spacing(1)}px 0`,
    },
    statusLabel: {
      display: 'block',
      fontSize: '0.6rem',
      margin: `${theme.spacing(1)}px 0 ${theme.spacing(1)}px ${-theme.spacing(
        2
      )}px`,
    },
    functionStatusLabel: {
      textAlign: 'center',
    },
    scopesWrapper: {
      padding: theme.spacing(3),
    },
  }),
  { withTheme: true }
)
export default class Entry extends Component {
  static propTypes = {
    /** Entry type. */
    type: oneOf(['function', 'topic-exchange', 'logs', 'schema']).isRequired,
    /** The reference entry, or {$id, schema} for a schema. */
    entry: object,
    /** Required when `type` is `topic-exchange`. */
    exchangePrefix: string,
    /** The service name to which the entry belongs, or null for a schema. */
    serviceName: string,
  };

  static defaultProps = {
    exchangePrefix: null,
    serviceName: null,
    entry: null,
  };

  state = {
    expanded:
      this.props.entry.name === window.location.hash.slice(1) ||
      this.props.entry.type === window.location.hash.slice(1) ||
      encodeURIComponent(path(['schema', '$id'], this.props.entry)) ===
        window.location.hash.slice(1),
  };

  getSignatureFromEntry(entry) {
    const parameters = entry.query.length
      ? entry.args.concat(`{${entry.query.join(', ')}}`)
      : [...entry.args];

    if (entry.input) {
      parameters.push('payload');
    }

    return `${entry.name}(${parameters.join(', ')}) : ${
      entry.output ? 'result' : 'void'
    }`;
  }

  renderFunctionExpansionPanelSummary = () => {
    const { entry, classes } = this.props;
    const signature = this.getSignatureFromEntry(entry);

    return (
      <Grid className={classes.gridContainer} container spacing={1}>
        <Grid item xs={6}>
          <div>
            <Typography variant="body2" id={entry.name} component="h3">
              {signature}
            </Typography>
          </div>
        </Grid>
        <Grid item xs={4}>
          <div>
            <Typography variant="body2">{entry.title}</Typography>
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
      <Grid className={classes.gridContainer} container spacing={1}>
        <Grid item xs={5}>
          <div>
            <Typography variant="body2" id={entry.name} component="h3">
              {entry.exchange}
            </Typography>
          </div>
        </Grid>
        <Grid item xs={7}>
          <div>
            <Typography variant="body2">{entry.title}</Typography>
          </div>
        </Grid>
      </Grid>
    );
  };

  renderLogsExpansionPanelSummary = () => {
    const { entry, classes } = this.props;

    return (
      <Grid className={classes.gridContainer} container spacing={1}>
        <Grid item xs={3}>
          <div>
            <Typography variant="body2" id={entry.type} component="h3">
              {entry.type}
            </Typography>
          </div>
        </Grid>
        <Grid item xs={1}>
          <div>
            <Typography variant="body2" component="h3">
              v{entry.version}
            </Typography>
          </div>
        </Grid>
        <Grid item xs={7}>
          <div>
            <Typography variant="body2">{entry.title}</Typography>
          </div>
        </Grid>
        <Grid item xs={1}>
          <div>
            <StatusLabel state={upperCase(entry.level)} />
          </div>
        </Grid>
      </Grid>
    );
  };

  renderSchemaExpansionPanelSummary = () => {
    const { entry, classes } = this.props;

    return (
      <Grid className={classes.gridContainer} container spacing={1}>
        <Grid item xs={5}>
          <div>
            <Typography
              variant="body2"
              id={encodeURIComponent(entry.schema.$id)}
              component="h3">
              {entry.schema.title}
            </Typography>
          </div>
        </Grid>
        <Grid item xs={7}>
          <div>
            <Typography variant="body2">{entry.schema.$id}</Typography>
          </div>
        </Grid>
      </Grid>
    );
  };

  renderSchemaTable = (schemaId, headerTitle) => (
    <ListItem>
      <ListItemText
        primaryTypographyProps={primaryTypographyProps}
        disableTypography
        primary={<Typography variant="body2">{headerTitle}</Typography>}
        secondary={
          <Fragment>
            <br />
            <SchemaTable schema={schemaId} />
          </Fragment>
        }
      />
    </ListItem>
  );

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
          <Typography
            variant="body2"
            className={classes.boxTop}
            component="span">
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
              <Typography
                variant="body2"
                className={classes.boxTop}
                component="span">
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
          <Typography
            variant="body2"
            className={classes.boxTop}
            component="span">
            for each{' '}
            <strong>
              <em>{scopes.for}</em>
            </strong>
          </Typography>
          <Typography
            variant="body2"
            className={classes.boxTop}
            component="span">
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
          <Typography
            variant="body2"
            className={classes.boxTop}
            component="span">
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
    const { serviceName, classes, entry } = this.props;
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
        {entry.input &&
          this.renderSchemaTable(
            `/schemas/${serviceName}/${entry.input}`,
            'Request Payload'
          )}
        {entry.output &&
          this.renderSchemaTable(
            `/schemas/${serviceName}/${entry.output}`,
            'Response Payload'
          )}
      </List>
    );
  };

  renderExchangeExpansionDetails = () => {
    const { classes, entry, exchangePrefix, serviceName } = this.props;
    const { expanded } = this.state;
    const exchange = `${exchangePrefix}${entry.exchange}`;
    const headers = [
      { label: 'Index', id: 'index', type: 'number' },
      {
        label: 'Name',
        id: 'name',
        type: 'string',
      },
      {
        label: 'Summary',
        id: 'summary',
        type: 'string',
      },
    ];

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
                  headers={headers}
                  items={entry.routingKey}
                  renderRow={(routingKey, idx) => (
                    <TableRow key={routingKey.name}>
                      <TableCell>{idx}</TableCell>
                      <TableCell>{routingKey.name}</TableCell>
                      <TableCell className={classes.summaryCell}>
                        <Markdown>{routingKey.summary}</Markdown>
                      </TableCell>
                      <TableCell className={classes.routingKeyCell}>
                        {routingKey.constant && (
                          <span
                            title={`This key always assume the value ${routingKey.constant}. Used to allow additional routing key formats.`}>
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
            this.renderSchemaTable(
              `/schemas/${serviceName}/${entry.schema}`,
              'Message Payload'
            )}
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
              primary="Description"
              secondary={<Markdown>{entry.description}</Markdown>}
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primaryTypographyProps={primaryTypographyProps}
              primary="Fields"
              secondary={
                <DataTable
                  size="medium"
                  items={Object.keys(entry.fields)}
                  renderRow={field => (
                    <TableRow key={field}>
                      <TableCell>{field}</TableCell>
                      <TableCell>{entry.fields[field]}</TableCell>
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

  renderSchemaExpansionDetails = () => {
    const { classes, entry } = this.props;
    const { expanded } = this.state;

    return (
      expanded && (
        <List className={classes.list}>
          {this.renderSchemaTable(entry.$id, entry.schema.description)}
        </List>
      )
    );
  };

  handlePanelChange = key => () => {
    const { entry, history } = this.props;
    const { expanded } = this.state;
    const hash = `#${encodeURIComponent(path(key.split('.'), entry))}`;

    if (window.location.hash === hash || expanded) {
      history.push(history.location.pathname);
    } else {
      history.push(hash);
    }

    this.setState({
      expanded: !expanded,
    });
  };

  getEntryHashKey = type => {
    switch (type) {
      case 'schema':
        return '$id';
      case 'logs':
        return 'type';
      default:
        return 'name';
    }
  };

  render() {
    const { classes, type } = this.props;
    const { expanded } = this.state;
    const isSchemaType = type === 'schema';
    const isExchangeType = type === 'topic-exchange';
    const isLogType = type === 'logs';
    const isFunctionType = type === 'function';
    const entryHashKey = this.getEntryHashKey(type);

    return (
      <ExpansionPanel
        defaultExpanded={expanded}
        onChange={this.handlePanelChange(entryHashKey)}
        CollapseProps={{ unmountOnExit: true }}
        elevation={2}>
        <ExpansionPanelSummary
          classes={{
            content: classNames(classes.expansionPanelSummary, {
              [classes.expansionPanelSummaryContent]: !isExchangeType,
            }),
          }}
          expandIcon={<ExpandMoreIcon />}>
          {isSchemaType && this.renderSchemaExpansionPanelSummary()}
          {isExchangeType && this.renderExchangeExpansionPanelSummary()}
          {isLogType && this.renderLogsExpansionPanelSummary()}
          {isFunctionType && this.renderFunctionExpansionPanelSummary()}
        </ExpansionPanelSummary>
        <ExpansionPanelDetails>
          {isSchemaType && this.renderSchemaExpansionDetails()}
          {isExchangeType && this.renderExchangeExpansionDetails()}
          {isLogType && this.renderLogsExpansionDetails()}
          {isFunctionType && this.renderFunctionExpansionDetails()}
        </ExpansionPanelDetails>
      </ExpansionPanel>
    );
  }
}
