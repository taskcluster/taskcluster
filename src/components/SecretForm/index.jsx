import React, { Component, Fragment } from 'react';
import { bool, func } from 'prop-types';
import { addYears } from 'date-fns';
import { safeDump, safeLoad } from 'js-yaml';
import CodeEditor from '@mozilla-frontend-infra/components/CodeEditor';
import { withStyles } from '@material-ui/core/styles';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import ListSubheader from '@material-ui/core/ListSubheader';
import TextField from '@material-ui/core/TextField';
import DeleteIcon from 'mdi-react/DeleteIcon';
import ContentSaveIcon from 'mdi-react/ContentSaveIcon';
import Button from '../Button';
import SpeedDial from '../SpeedDial';
import DatePicker from '../DatePicker';
import SpeedDialAction from '../SpeedDialAction';
import { secret } from '../../utils/prop-types';
import withAlertOnClose from '../../utils/withAlertOnClose';

const newSecret = safeDump({
  foo: 'bar',
});

@withAlertOnClose
@withStyles(theme => ({
  fab: {
    ...theme.mixins.fab,
  },
  editorListItem: {
    paddingTop: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'start',
    '&> :last-child': {
      marginTop: theme.spacing.unit,
    },
  },
  saveIcon: {
    ...theme.mixins.successIcon,
  },
  deleteIcon: {
    ...theme.mixins.errorIcon,
  },
}))
/** A form to view/edit/create a secret */
export default class SecretForm extends Component {
  static defaultProps = {
    loading: false,
    isNewSecret: false,
    secret: null,
    onDeleteSecret: null,
  };

  static getDerivedStateFromProps({ isNewSecret, secret }, state) {
    if (isNewSecret || state.secretName) {
      return null;
    }

    return {
      secretName: secret.name,
      expires: secret.expires,
      editorValue: safeDump(secret.secret),
    };
  }

  static propTypes = {
    /** A GraphQL secret response. Not needed when creating a new secret.  */
    // eslint-disable-next-line react/no-unused-prop-types
    secret,
    /** Set to `true` when creating a new secret. */
    isNewSecret: bool,
    /** Callback function fired when a secret is created/updated. */
    onSaveSecret: func.isRequired,
    /** Callback function fired when a secret is deleted. */
    onDeleteSecret: func,
    /** If true, form actions will be disabled. */
    loading: bool,
  };

  state = {
    secretName: '',
    expires: addYears(new Date(), 1000),
    editorValue: null,
  };

  handleDeleteSecret = () => {
    this.props.onDeleteSecret(this.state.secretName);
  };

  handleEditorChange = editorValue => {
    this.setState({
      editorValue,
    });
  };

  handleExpirationChange = expires => {
    this.setState({
      expires,
    });
  };

  handleInputChange = ({ target: { name, value } }) => {
    this.setState({ [name]: value });
  };

  handleSaveSecret = () => {
    const { secretName, editorValue, expires } = this.state;

    this.props.onSaveSecret(secretName, {
      expires,
      secret: safeLoad(editorValue),
    });
  };

  validSecret = () => {
    const { editorValue, secretName, expires } = this.state;

    try {
      safeLoad(editorValue);

      return secretName && expires;
    } catch (err) {
      return false;
    }
  };

  render() {
    const { classes, isNewSecret, loading } = this.props;
    const { secretName, editorValue, expires } = this.state;

    return (
      <Fragment>
        <List>
          {isNewSecret && (
            <ListItem>
              <TextField
                required
                label="Secret"
                name="secretName"
                onChange={this.handleInputChange}
                fullWidth
                value={secretName}
              />
            </ListItem>
          )}
          {!isNewSecret && (
            <ListItem>
              <ListItemText primary="Secret" secondary={secretName} />
            </ListItem>
          )}
          <ListItem>
            <DatePicker
              value={expires}
              onChange={this.handleExpirationChange}
              format="YYYY/MM/DD"
              maxDate={addYears(new Date(), 1001)}
            />
          </ListItem>
          <List
            subheader={<ListSubheader>Secret Value (in YAML)</ListSubheader>}>
            <ListItem className={classes.editorListItem}>
              <CodeEditor
                onChange={this.handleEditorChange}
                mode="yaml"
                value={
                  typeof editorValue === 'object' ? newSecret : editorValue
                }
              />
            </ListItem>
          </List>
        </List>
        {isNewSecret ? (
          <Button
            spanProps={{ className: classes.fab }}
            tooltipProps={{ title: 'Save Secret' }}
            requiresAuth
            color="secondary"
            variant="round"
            className={classes.saveIcon}
            disabled={loading || !this.validSecret()}
            onClick={this.handleSaveSecret}>
            <ContentSaveIcon />
          </Button>
        ) : (
          <SpeedDial>
            <SpeedDialAction
              requiresAuth
              tooltipOpen
              icon={<ContentSaveIcon />}
              onClick={this.handleSaveSecret}
              className={classes.saveIcon}
              tooltipTitle="Save Secret"
              ButtonProps={{
                disabled: loading || !this.validSecret(),
              }}
            />
            <SpeedDialAction
              requiresAuth
              tooltipOpen
              icon={<DeleteIcon />}
              onClick={this.handleDeleteSecret}
              className={classes.deleteIcon}
              tooltipTitle="Delete Secret"
              ButtonProps={{
                disabled: loading,
              }}
            />
          </SpeedDial>
        )}
      </Fragment>
    );
  }
}
