import { hot } from 'react-hot-loader';
import { Component, Fragment } from 'react';
import classNames from 'classnames';
import { withStyles } from '@material-ui/core/styles';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import Tooltip from '@material-ui/core/Tooltip';
import TextField from '@material-ui/core/TextField';
import Typography from '@material-ui/core/Typography';
import Button from '@material-ui/core/Button';
import IconButton from '@material-ui/core/IconButton';
import Toolbar from '@material-ui/core/Toolbar';
import { parse, stringify } from 'qs';
import PlayIcon from 'mdi-react/PlayIcon';
import StopIcon from 'mdi-react/StopIcon';
import PlusIcon from 'mdi-react/PlusIcon';
import DeleteIcon from 'mdi-react/DeleteIcon';
import Dashboard from '../../components/Dashboard';
import DataTable from '../../components/DataTable';

const getBindingsFromProps = props => {
  const query = parse(props.location.search.slice(1));

  return query.bindings ? Object.values(query.bindings) : [];
};

@hot(module)
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
  fab: {
    ...theme.mixins.fab,
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
}))
export default class PulseMessages extends Component {
  constructor(props) {
    super(props);

    const bindings = getBindingsFromProps(props);

    this.state = {
      bindings,
      pulseExchange: '',
      routingKeyPattern: '#',
      listening: false,
      messages: [],
    };
  }

  handleInputChange = ({ target: { name, value } }) => {
    this.setState({ [name]: value });
  };

  static getDerivedStateFromProps(props) {
    return {
      bindings: getBindingsFromProps(props),
    };
  }

  handleAddBinding = () => {
    const { pulseExchange, routingKeyPattern } = this.state;
    const bindings = this.state.bindings.concat([
      {
        exchange: pulseExchange,
        routingKeyPattern,
      },
    ]);

    this.props.history.replace(`/pulse-messages?${stringify({ bindings })}`);
  };

  handleDeleteBinding = ({ exchange, routingKeyPattern }) => {
    const bindings = this.state.bindings.filter(
      binding =>
        binding.exchange !== exchange ||
        binding.routingKeyPattern !== routingKeyPattern
    );

    this.props.history.replace(`/pulse-messages?${stringify({ bindings })}`);
  };

  handleStartListening = () => {
    this.setState({ listening: true });
  };

  handleStopListening = () => {
    this.setState({ listening: false });
  };

  render() {
    const { classes } = this.props;
    const {
      pulseExchange,
      routingKeyPattern,
      bindings,
      listening,
      messages,
    } = this.state;

    return (
      <Dashboard title="Pulse Messages">
        <Fragment>
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
                      name="routingKeyPattern"
                      onChange={this.handleInputChange}
                      fullWidth
                      value={routingKeyPattern}
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
                      <code>{binding.routingKeyPattern}</code>
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
            />
          </List>
          {listening ? (
            <Tooltip title="Stop Listening">
              <div className={classes.fab}>
                <Button
                  classes={{ root: classes.stopIcon }}
                  variant="fab"
                  onClick={this.handleStopListening}>
                  <StopIcon />
                </Button>
              </div>
            </Tooltip>
          ) : (
            <Tooltip title="Start Listening">
              <div className={classes.fab}>
                <Button
                  classes={{ root: classes.playIcon }}
                  variant="fab"
                  onClick={this.handleStartListening}>
                  <PlayIcon />
                </Button>
              </div>
            </Tooltip>
          )}
        </Fragment>
      </Dashboard>
    );
  }
}
