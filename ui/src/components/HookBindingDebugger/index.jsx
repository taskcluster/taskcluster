import React, { Component, Fragment } from 'react';
import { arrayOf, bool, func, object } from 'prop-types';
import classNames from 'classnames';
import { equals } from 'ramda';
import { alpha, withStyles } from '@material-ui/core/styles';
import Drawer from '@material-ui/core/Drawer';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import Typography from '@material-ui/core/Typography';
import IconButton from '@material-ui/core/IconButton';
import Collapse from '@material-ui/core/Collapse';
import CloseIcon from 'mdi-react/CloseIcon';
import PlayIcon from 'mdi-react/PlayIcon';
import StopIcon from 'mdi-react/StopIcon';
import CheckIcon from 'mdi-react/CheckIcon';
import AlertCircleIcon from 'mdi-react/AlertCircleIcon';
import ChevronDownIcon from 'mdi-react/ChevronDownIcon';
import ChevronRightIcon from 'mdi-react/ChevronRightIcon';
import Button from '../Button';
import JsonDisplay from '../JsonDisplay';
import ErrorPanel from '../ErrorPanel';
import subscribeToPulseMessages from '../../utils/pulseListener';
import buildTriggerSchemaValidator from '../../utils/triggerSchemaValidator';

// Cap retained rows so a busy binding cannot grow state/DOM without bound; the
// cumulative counters keep climbing after old rows are trimmed.
const MAX_MESSAGES = 250;

const MISSING_SCOPE_MESSAGE =
  'Live Pulse listening is not available because you are missing the ' +
  'web:read-pulse scope. Permission to view or modify this hook does not ' +
  'grant it. Ask an administrator for web:read-pulse, then try again.';

@withStyles(theme => ({
  drawerPaper: {
    width: '40vw',
    [theme.breakpoints.down('sm')]: {
      width: '90vw',
    },
  },
  drawerContainer: {
    paddingTop: theme.spacing(2),
    paddingBottom: theme.spacing(2),
  },
  drawerHeadline: {
    paddingLeft: theme.spacing(3),
    paddingRight: theme.spacing(3),
  },
  drawerCloseIcon: {
    position: 'absolute',
    top: theme.spacing(1),
    right: theme.spacing(1),
  },
  playIcon: {
    ...theme.mixins.successIcon,
  },
  stopIcon: {
    ...theme.mixins.errorIcon,
  },
  summary: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(2),
    paddingLeft: theme.spacing(3),
    paddingRight: theme.spacing(3),
    paddingBottom: theme.spacing(1),
  },
  messageList: {
    paddingTop: 0,
  },
  messageItem: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    cursor: 'pointer',
    paddingTop: theme.spacing(0.75),
    paddingBottom: theme.spacing(0.75),
  },
  passRow: {
    backgroundColor: alpha(theme.palette.success.main, 0.15),
  },
  rejectedRow: {
    backgroundColor: alpha(theme.palette.error.main, 0.15),
  },
  // exchange is the only thing shown on the collapsed row; truncate so it
  // stays a single line in the narrow drawer.
  exchangeText: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: 'monospace',
  },
  details: {
    paddingLeft: theme.spacing(3),
    paddingRight: theme.spacing(3),
    paddingBottom: theme.spacing(2),
  },
  detailLabel: {
    marginTop: theme.spacing(1),
  },
  wordBreak: {
    wordBreak: 'break-all',
  },
  passText: {
    color: theme.palette.success.main,
  },
  rejectedText: {
    color: theme.palette.error.main,
  },
  iconButton: {
    '& svg': {
      fill: theme.palette.text.primary,
    },
  },
}))
export default class HookBindingDebugger extends Component {
  static propTypes = {
    /** Whether the drawer is open. Owned by the parent (HookForm). */
    open: bool.isRequired,
    /** Called when the drawer requests to close; the parent clears `open`. */
    onClose: func.isRequired,
    /** The hook's saved bindings ([{ exchange, routingKeyPattern }]). */
    bindings: arrayOf(object).isRequired,
    /** The hook's saved triggerSchema. */
    triggerSchema: object.isRequired,
  };

  // Teardown fn for the active subscription; cleared after it runs.
  unsubscribeFn = null;

  // Monotonically increasing React key for rows (exchange + routingKey is not
  // unique).
  nextId = 0;

  constructor(props) {
    super(props);

    const { validate, schemaError } = buildTriggerSchemaValidator(
      props.triggerSchema
    );

    this.state = {
      listening: false,
      messages: [],
      passCount: 0,
      rejectCount: 0,
      error: null,
      expandedId: null,
      validate,
      schemaError,
      previousTriggerSchema: props.triggerSchema,
      previousBindings: props.bindings,
    };
  }

  static getDerivedStateFromProps(props, state) {
    const schemaChanged = !equals(
      props.triggerSchema,
      state.previousTriggerSchema
    );
    const bindingsChanged = !equals(props.bindings, state.previousBindings);

    // Compare structurally so a re-render that re-creates an equal object does
    // not needlessly reset anything.
    if (!schemaChanged && !bindingsChanged) {
      return null;
    }

    // When the saved definition changes (e.g. after a successful hook update),
    // drop verdicts, counters and any expanded row evaluated against the
    // previous bindings/schema.
    const next = {
      previousTriggerSchema: props.triggerSchema,
      previousBindings: props.bindings,
      messages: [],
      passCount: 0,
      rejectCount: 0,
      expandedId: null,
    };

    if (schemaChanged) {
      // Recompile the validator against the new saved schema.
      const { validate, schemaError } = buildTriggerSchemaValidator(
        props.triggerSchema
      );

      next.validate = validate;
      next.schemaError = schemaError;
    }

    return next;
  }

  componentDidUpdate(prevProps) {
    // The drawer can stay mounted with open={false}, so componentWillUnmount is
    // not enough: explicitly Stop when the parent closes the drawer.
    if (prevProps.open && !this.props.open) {
      this.handleStopListening();

      return;
    }

    // If the saved definition changes while listening, restart against it.
    const bindingsChanged = !equals(prevProps.bindings, this.props.bindings);
    const schemaChanged = !equals(
      prevProps.triggerSchema,
      this.props.triggerSchema
    );

    if (this.state.listening && (bindingsChanged || schemaChanged)) {
      // A malformed new schema has no usable validator, so stop rather than
      // restart into messages we cannot classify.
      if (this.state.schemaError) {
        this.handleStopListening();
      } else {
        this.handleStartListening();
      }
    }
  }

  componentWillUnmount() {
    this.teardown();
  }

  teardown() {
    if (this.unsubscribeFn) {
      this.unsubscribeFn();
      this.unsubscribeFn = null;
    }
  }

  handleStartListening = () => {
    // Tear down any prior run before starting a new one.
    this.teardown();
    this.setState({ listening: true, error: null });

    this.unsubscribeFn = subscribeToPulseMessages(this.props.bindings, {
      onMessage: this.handleMessage,
      onError: this.handleError,
    });
  };

  handleStopListening = () => {
    this.teardown();
    this.setState({ listening: false });
  };

  handleMessage = message => {
    const { validate } = this.state;

    // A malformed schema has no validator; don't classify (that would wrongly
    // mark messages as passed).
    if (!validate) {
      return;
    }

    const validationError = validate(message.payload);
    const id = this.nextId;

    this.nextId += 1;

    const row = {
      id,
      receivedAt: new Date().toISOString(),
      validationError,
      ...message,
    };

    this.setState(state => ({
      // newest first; trim oldest beyond the cap
      messages: [row, ...state.messages].slice(0, MAX_MESSAGES),
      // cumulative totals — never reset when old rows are trimmed
      passCount: state.passCount + (validationError ? 0 : 1),
      rejectCount: state.rejectCount + (validationError ? 1 : 0),
    }));
  };

  handleError = error => {
    this.teardown();
    this.setState({ error, listening: false });
  };

  handleToggleExpand = id => {
    this.setState(state => ({
      expandedId: state.expandedId === id ? null : id,
    }));
  };

  renderError() {
    const { error } = this.state;

    if (!error) {
      return null;
    }

    if (error?.message?.includes('InsufficientScopes')) {
      return <ErrorPanel error={MISSING_SCOPE_MESSAGE} />;
    }

    return <ErrorPanel error={error} />;
  }

  renderDetailField(label, value) {
    const { classes } = this.props;

    return (
      <Fragment>
        <Typography
          variant="caption"
          color="textSecondary"
          component="div"
          className={classes.detailLabel}>
          {label}
        </Typography>
        {value}
      </Fragment>
    );
  }

  // Collapsed row shows only the verdict icon + exchange; the rest is revealed
  // on expand.
  renderMessage = row => {
    const { classes } = this.props;
    const { expandedId } = this.state;
    const rejected = Boolean(row.validationError);
    const expanded = expandedId === row.id;
    const iconSize = 16;

    return (
      <Fragment key={row.id}>
        <ListItem
          button
          data-testid="pulse-message"
          className={classNames(classes.messageItem, {
            [classes.rejectedRow]: rejected,
            [classes.passRow]: !rejected,
          })}
          onClick={() => this.handleToggleExpand(row.id)}>
          {expanded ? (
            <ChevronDownIcon size={iconSize} />
          ) : (
            <ChevronRightIcon size={iconSize} />
          )}
          {rejected ? (
            <AlertCircleIcon
              aria-label="rejected"
              className={classes.rejectedText}
              size={iconSize}
            />
          ) : (
            <CheckIcon
              aria-label="passed"
              className={classes.passText}
              size={iconSize}
            />
          )}
          <span className={classes.exchangeText}>{row.exchange}</span>
        </ListItem>
        <Collapse in={expanded} unmountOnExit>
          <div className={classes.details}>
            {this.renderDetailField(
              'Routing Key',
              <code className={classes.wordBreak}>{row.routingKey}</code>
            )}
            {this.renderDetailField('Received', row.receivedAt)}
            {this.renderDetailField(
              'Result',
              rejected ? (
                <Typography
                  variant="body2"
                  className={classNames(
                    classes.rejectedText,
                    classes.wordBreak
                  )}>
                  {row.validationError}
                </Typography>
              ) : (
                <Typography variant="body2" className={classes.passText}>
                  Passed
                </Typography>
              )
            )}
            {this.renderDetailField(
              'Payload',
              <JsonDisplay syntax="json" objectContent={row.payload} />
            )}
          </div>
        </Collapse>
      </Fragment>
    );
  };

  render() {
    const { classes, open, onClose, bindings } = this.props;
    const { listening, messages, passCount, rejectCount, schemaError } =
      this.state;

    return (
      <Drawer
        anchor="right"
        open={open}
        classes={{ paper: classes.drawerPaper }}
        onClose={onClose}>
        <IconButton onClick={onClose} className={classes.drawerCloseIcon}>
          <CloseIcon />
        </IconButton>
        <div className={classes.drawerContainer}>
          <Typography variant="h5" className={classes.drawerHeadline}>
            Debug Bindings
          </Typography>
          <Typography
            variant="body2"
            color="textSecondary"
            className={classes.drawerHeadline}>
            Watch Pulse messages arriving on this hook&apos;s saved bindings and
            see, per message, whether the payload passes the hook&apos;s trigger
            schema (green) or is rejected (red).
          </Typography>
          <List>
            <ListItem>
              <ListItemText
                disableTypography
                primary={
                  <Typography variant="subtitle1">Listening on</Typography>
                }
                secondary={
                  <List>
                    {bindings.map(binding => (
                      <ListItem
                        key={`${binding.exchange}-${binding.routingKeyPattern}`}>
                        <Typography variant="body2">
                          <code>{binding.exchange}</code> with{' '}
                          <code>{binding.routingKeyPattern}</code>
                        </Typography>
                      </ListItem>
                    ))}
                  </List>
                }
              />
            </ListItem>
          </List>
          {this.renderError()}
          {schemaError ? (
            <ErrorPanel
              warning
              error={`This hook's trigger schema is not a valid JSON schema, so payloads cannot be validated: ${schemaError}`}
            />
          ) : null}
          <div className={classes.summary}>
            {listening ? (
              <Button
                variant="contained"
                onClick={this.handleStopListening}
                className={classes.stopIcon}>
                <StopIcon /> Stop
              </Button>
            ) : (
              <Button
                variant="contained"
                onClick={this.handleStartListening}
                className={classes.playIcon}
                disabled={Boolean(schemaError) || !bindings.length}>
                <PlayIcon /> Start
              </Button>
            )}
            <Typography variant="body2" component="span">
              {' '}
              <span className={classes.passText}>✓ {passCount} passed</span>
              {' / '}
              <span className={classes.rejectedText}>
                ✗ {rejectCount} rejected
              </span>
            </Typography>
          </div>
          {messages.length ? (
            <List className={classes.messageList}>
              {messages.map(this.renderMessage)}
            </List>
          ) : (
            <Typography
              variant="body2"
              color="textSecondary"
              className={classes.drawerHeadline}>
              {listening
                ? 'Listening… no messages received yet.'
                : 'Not listening. Click Start to watch for Pulse messages.'}
            </Typography>
          )}
        </div>
      </Drawer>
    );
  }
}
