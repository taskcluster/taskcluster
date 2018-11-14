import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { withApollo } from 'react-apollo';
import classNames from 'classnames';
import { withStyles } from '@material-ui/core/styles';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import Tooltip from '@material-ui/core/Tooltip';
import TextField from '@material-ui/core/TextField';
import Typography from '@material-ui/core/Typography';
import IconButton from '@material-ui/core/IconButton';
import Drawer from '@material-ui/core/Drawer';
import Toolbar from '@material-ui/core/Toolbar';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import { parse, stringify } from 'qs';
import PlayIcon from 'mdi-react/PlayIcon';
import DownloadIcon from 'mdi-react/DownloadIcon';
import CloseIcon from 'mdi-react/CloseIcon';
import StopIcon from 'mdi-react/StopIcon';
import PlusIcon from 'mdi-react/PlusIcon';
import InformationVariantIcon from 'mdi-react/InformationVariantIcon';
import DeleteIcon from 'mdi-react/DeleteIcon';
import urls from '../../utils/urls';
import ErrorPanel from '../../components/ErrorPanel';
import Dashboard from '../../components/Dashboard';
import HelpView from '../../components/HelpView';
import Button from '../../components/Button';
import SpeedDial from '../../components/SpeedDial';
import SpeedDialAction from '../../components/SpeedDialAction';
import DataTable from '../../components/DataTable';
import JsonInspector from '../../components/JsonInspector';
import pulseMessagesQuery from './pulseMessages.graphql';
import removeKeys from '../../utils/removeKeys';

const getBindingsFromProps = props => {
  const query = parse(props.location.search.slice(1));

  return query.bindings ? Object.values(query.bindings) : [];
};

@hot(module)
@withApollo
@withStyles(theme => ({
  iconButton: {
    '& svg': {
      fill: theme.palette.text.primary,
    },
  },
  plusIcon: {
    marginTop: 45,
  },
  deleteIcon: {
    marginRight: -theme.spacing.triple,
    [theme.breakpoints.down('sm')]: {
      marginRight: -14,
    },
  },
  playIcon: {
    ...theme.mixins.successIcon,
  },
  stopIcon: {
    ...theme.mixins.errorIcon,
  },
  inputWrapper: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inputList: {
    flex: 1,
  },
  bindingListItem: {
    paddingTop: 0,
    paddingBottom: 0,
  },
  infoButton: {
    marginLeft: -theme.spacing.double,
    marginRight: theme.spacing.unit,
  },
  drawerContainer: {
    paddingTop: theme.spacing.double,
    paddingBottom: theme.spacing.double,
  },
  drawerHeadline: {
    paddingLeft: theme.spacing.triple,
    paddingRight: theme.spacing.triple,
  },
  drawerPaper: {
    width: '40vw',
    [theme.breakpoints.down('sm')]: {
      width: '90vw',
    },
  },
  drawerCloseIcon: {
    position: 'absolute',
    top: theme.spacing.unit,
    right: theme.spacing.unit,
  },
  ccContainer: {
    overflow: 'auto',
  },
  ccRoute: {
    whiteSpace: 'nowrap',
  },
}))
export default class PulseMessages extends Component {
  static getDerivedStateFromProps(props) {
    return {
      bindings: getBindingsFromProps(props),
    };
  }

  subscriptionObserver = null;

  constructor(props) {
    super(props);

    const bindings = getBindingsFromProps(props);

    this.state = {
      bindings,
      pulseExchange: '',
      pattern: '#',
      listening: false,
      messages: [],
      error: null,
      drawerOpen: false,
      drawerMessage: null,
      downloadLink: 'data:application/json;base64,IkJyb3dzZXIgSXNzdWUi',
    };
  }

  componentWillUnmount() {
    this.unsubscribe();
  }

  handleInputChange = ({ target: { name, value } }) => {
    this.setState({ [name]: value });
  };

  handleAddBinding = () => {
    const { pulseExchange, pattern } = this.state;
    const bindings = this.state.bindings.concat([
      {
        exchange: pulseExchange,
        pattern,
      },
    ]);

    this.props.history.replace(`/pulse-messages?${stringify({ bindings })}`);
  };

  handleDeleteBinding = ({ exchange, pattern }) => {
    this.handleStopListening();
    const bindings = this.state.bindings.filter(
      binding => binding.exchange !== exchange || binding.pattern !== pattern
    );

    this.props.history.replace(`/pulse-messages?${stringify({ bindings })}`);
  };

  handleInputChange = ({ target: { name, value } }) => {
    this.setState({ [name]: value });
  };

  handleStartListening = () => {
    this.setState({ listening: true, error: null });

    this.subscriptionObserver = this.props.client
      .subscribe({
        query: pulseMessagesQuery,
        variables: {
          subscriptions: this.state.bindings,
        },
      })
      .subscribe({
        next: ({ data: { pulseMessages } }) => {
          // ... call updateQuery to integrate the new comment
          // into the existing list of comments
          this.addMessage(pulseMessages);
        },
        error: error => {
          this.setState({ error, listening: false });
        },
      });
  };

  handleStopListening = () => {
    this.setState({ listening: false });

    this.unsubscribe();
  };

  handleMessageDrawerOpen = message => {
    this.setState({ drawerOpen: true, drawerMessage: message });
  };

  handleMessageDrawerClose = () => {
    this.setState({ drawerOpen: false, drawerMessage: null });
  };

  handleDownloadMessagesClick = () => {
    const a = Object.assign(document.createElement('a'), {
      href: this.state.downloadLink,
      download: 'pulse-messages.json',
    });

    // a.click() doesn't work on all browsers
    a.dispatchEvent(new MouseEvent('click'));
  };

  addMessage(message) {
    const messages = removeKeys(this.state.messages.concat(message), [
      '__typename',
    ]);
    const params = btoa(JSON.stringify(messages, null, 2));

    this.setState({
      messages,
      downloadLink: `data:application/json;base64,${params}`,
    });
  }

  unsubscribe() {
    if (this.subscriptionObserver) {
      this.subscriptionObserver.unsubscribe();
    }
  }

  render() {
    const { classes } = this.props;
    const {
      pulseExchange,
      pattern,
      bindings,
      listening,
      messages,
      error,
      drawerOpen,
      drawerMessage,
    } = this.state;
    const iconSize = 16;
    const description = `Bind to Pulse exchanges in your browser, observe messages arriving and inspect
      messages. Useful when debugging and working with undocumented Pulse exchanges.`;

    return (
      <Dashboard
        title="Pulse Messages"
        helpView={
          <HelpView description={description}>
            <Typography paragraph>
              This tool lets you listen to Pulse messages from any exchange and
              routing key. When messages are received you can inspect the
              messages. This is useful for debugging and development when
              consuming from undocumented exchanges. Notice that all exchanges
              from {process.env.APPLICATION_NAME} are formally documented on{' '}
              <a
                href={urls.docs('/')}
                target="_blank"
                rel="noopener noreferrer">
                {urls.docs('/')}
              </a>
              .
            </Typography>
          </HelpView>
        }>
        <Fragment>
          <ErrorPanel error={error} />
          <div className={classes.inputWrapper}>
            <List className={classes.inputList}>
              <ListItem>
                <ListItemText
                  primary={
                    <TextField
                      required
                      label="Pulse Exchange"
                      name="pulseExchange"
                      placeholder="exchange/<username>/some-exchange-name"
                      onChange={this.handleInputChange}
                      fullWidth
                      value={pulseExchange}
                    />
                  }
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary={
                    <TextField
                      required
                      label="Routing Key Pattern"
                      placeholder="#.some-interesting-key.#"
                      name="pattern"
                      onChange={this.handleInputChange}
                      fullWidth
                      value={pattern}
                    />
                  }
                />
              </ListItem>
            </List>
            <Tooltip title="Add Binding">
              <IconButton
                className={classNames(classes.iconButton, classes.plusIcon)}
                onClick={this.handleAddBinding}>
                <PlusIcon />
              </IconButton>
            </Tooltip>
          </div>
          <List>
            {bindings.map(binding => (
              <ListItem
                className={classes.bindingListItem}
                key={`${binding.exchange}-${binding.routingKeyPattern}`}>
                <ListItemText
                  disableTypography
                  primary={
                    <Typography variant="body2">
                      <code>{binding.exchange}</code> with{' '}
                      <code>{binding.pattern}</code>
                    </Typography>
                  }
                />
                <Tooltip title="Delete Binding">
                  <IconButton
                    className={classNames(
                      classes.iconButton,
                      classes.deleteIcon
                    )}
                    name={binding}
                    onClick={() => this.handleDeleteBinding(binding)}>
                    <DeleteIcon />
                  </IconButton>
                </Tooltip>
              </ListItem>
            ))}
            <Toolbar>
              <Typography variant="body2" id="tableTitle">
                Messages
              </Typography>
            </Toolbar>
            <DataTable
              items={messages}
              noItemsMessage="No messages received."
              renderRow={message => (
                <TableRow
                  key={`message-${message.routingKey}-${message.exchange}`}>
                  <TableCell>
                    <Button
                      className={classes.infoButton}
                      size="small"
                      onClick={() => this.handleMessageDrawerOpen(message)}>
                      <InformationVariantIcon size={iconSize} />
                    </Button>
                    {message.exchange}
                  </TableCell>
                  <TableCell>{message.routingKey}</TableCell>
                </TableRow>
              )}
              headers={['Exchange', 'Routing Key']}
            />
          </List>
          <SpeedDial>
            {listening ? (
              <SpeedDialAction
                tooltipOpen
                icon={<StopIcon />}
                onClick={this.handleStopListening}
                className={classes.stopIcon}
                tooltipTitle="Stop Listening"
              />
            ) : (
              <SpeedDialAction
                tooltipOpen
                icon={<PlayIcon />}
                onClick={this.handleStartListening}
                className={classes.playIcon}
                tooltipTitle="Start Listening"
                ButtonProps={{ disabled: !bindings.length }}
              />
            )}
            <SpeedDialAction
              tooltipOpen
              icon={<DownloadIcon />}
              tooltipTitle="Download Messages"
              onClick={this.handleDownloadMessagesClick}
              ButtonProps={{ disabled: !messages[0] }}
            />
          </SpeedDial>
          <Drawer
            anchor="right"
            open={drawerOpen}
            classes={{
              paper: classes.drawerPaper,
            }}
            onClose={this.handleMessageDrawerClose}>
            <Fragment>
              <IconButton
                onClick={this.handleMessageDrawerClose}
                className={classes.drawerCloseIcon}>
                <CloseIcon />
              </IconButton>
              <div className={classes.drawerContainer}>
                <Typography variant="h5" className={classes.drawerHeadline}>
                  Message
                </Typography>
                <List>
                  <ListItem>
                    <ListItemText
                      primary="Exchange"
                      secondary={
                        <code>{drawerMessage && drawerMessage.exchange}</code>
                      }
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText
                      primary="Routing Key"
                      secondary={
                        <code>{drawerMessage && drawerMessage.routingKey}</code>
                      }
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText
                      primary="Redelivered"
                      secondary={
                        drawerMessage && drawerMessage.redelivered
                          ? 'True'
                          : 'False'
                      }
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText
                      primary="CC Routes"
                      secondary={
                        drawerMessage && drawerMessage.cc.length ? (
                          <List className={classes.ccContainer}>
                            {drawerMessage.cc.map(route => (
                              <ListItem key={route} className={classes.ccRoute}>
                                <code>{route}</code>
                              </ListItem>
                            ))}
                          </List>
                        ) : (
                          'n/a'
                        )
                      }
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText
                      primary="Payload"
                      secondaryTypographyProps={{
                        component: 'div',
                      }}
                      secondary={
                        <JsonInspector
                          data={drawerMessage && drawerMessage.payload}
                        />
                      }
                    />
                  </ListItem>
                </List>
              </div>
            </Fragment>
          </Drawer>
        </Fragment>
      </Dashboard>
    );
  }
}
