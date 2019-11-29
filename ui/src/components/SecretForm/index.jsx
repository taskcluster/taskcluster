import React, { Component, Fragment } from 'react';
import { oneOfType, object, string, func, bool } from 'prop-types';
import classNames from 'classnames';
import { addYears } from 'date-fns';
import { safeDump, safeLoad } from 'js-yaml';
import CodeEditor from '@mozilla-frontend-infra/components/CodeEditor';
import { withStyles } from '@material-ui/core/styles';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import Typography from '@material-ui/core/Typography';
import ListItemText from '@material-ui/core/ListItemText';
import ListSubheader from '@material-ui/core/ListSubheader';
import TextField from '@material-ui/core/TextField';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Switch from '@material-ui/core/Switch';
import DeleteIcon from 'mdi-react/DeleteIcon';
import ContentSaveIcon from 'mdi-react/ContentSaveIcon';
import DialogAction from '../DialogAction';
import Button from '../Button';
import SpeedDial from '../SpeedDial';
import DatePicker from '../DatePicker';
import SpeedDialAction from '../SpeedDialAction';
import { secret } from '../../utils/prop-types';

@withStyles(theme => ({
  fab: {
    ...theme.mixins.fab,
    ...theme.mixins.actionButton,
  },
  saveSecretSpan: {
    position: 'fixed',
    bottom: theme.spacing(2),
    right: theme.spacing(11),
  },
  editorListItem: {
    paddingTop: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'start',
    '&> :last-child': {
      marginTop: theme.spacing(1),
    },
  },
  saveIcon: {
    ...theme.mixins.successIcon,
  },
  deleteIcon: {
    ...theme.mixins.errorIcon,
  },
  deleteTooltipLabel: {
    backgroundColor: theme.mixins.errorIcon.backgroundColor,
  },
  secretSubheader: {
    display: 'flex',
  },
}))
/** A form to view/edit/create a secret */
export default class SecretForm extends Component {
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
    /** Error to display when an action dialog is open. */
    dialogError: oneOfType([string, object]),
    /**
     * Callback function fired when the DialogAction component throws an error.
     * Required when viewing an existent address.
     * */
    onDialogActionError: func,
    /**
     * Callback function fired when the DialogAction component runs
     * successfully. Required when viewing an existent address.
     * */
    onDialogActionComplete: func,
    /**
     * Callback function fired when the dialog should open.
     * Required when viewing an existent address.
     */
    onDialogActionOpen: func,
    /**
     * Callback function fired when the dialog should close.
     * Required when viewing an existent address.
     */
    onDialogActionClose: func,
  };

  static defaultProps = {
    loading: false,
    isNewSecret: false,
    secret: null,
    onDeleteSecret: null,
    dialogError: null,
    onDialogActionError: null,
    onDialogActionComplete: null,
    onDialogActionOpen: null,
    onDialogActionClose: null,
  };

  state = {
    secretName: this.props.isNewSecret ? '' : this.props.secret.name,
    expires: this.props.isNewSecret
      ? addYears(new Date(), 1000)
      : this.props.secret.expires,
    editorValue: this.props.isNewSecret
      ? ''
      : safeDump(this.props.secret.secret),
    showSecret: this.props.isNewSecret,
  };

  handleDeleteSecret = () => this.props.onDeleteSecret(this.state.secretName);

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

      return secretName && expires && editorValue;
    } catch (err) {
      return false;
    }
  };

  handleSecretToggle = ({ target }) => {
    this.setState({ showSecret: target.checked });
  };

  render() {
    const {
      secret,
      classes,
      isNewSecret,
      loading,
      dialogOpen,
      dialogError,
      onDialogActionClose,
      onDialogActionError,
      onDialogActionOpen,
      onDialogActionComplete,
    } = this.props;
    const { secretName, editorValue, expires, showSecret } = this.state;
    const isSecretDirty =
      isNewSecret ||
      secretName !== secret.name ||
      editorValue !== safeDump(secret.secret) ||
      expires !== secret.expires;

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
                autoFocus
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
              label="Expires"
              value={expires}
              onChange={this.handleExpirationChange}
              maxDate={addYears(new Date(), 1001)}
            />
          </ListItem>
          <List
            subheader={
              <div className={classes.secretSubheader}>
                <ListSubheader>Secret Value (in YAML)</ListSubheader>
                {!isNewSecret && (
                  <FormControlLabel
                    control={
                      <Switch
                        checked={showSecret}
                        onChange={this.handleSecretToggle}
                        value={showSecret}
                      />
                    }
                    label="Show Secret"
                  />
                )}
              </div>
            }>
            {showSecret && (
              <ListItem className={classes.editorListItem}>
                <CodeEditor
                  placeholder="YAML representation of secret data"
                  onChange={this.handleEditorChange}
                  mode="yaml"
                  lint
                  value={editorValue}
                />
              </ListItem>
            )}
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
            disabled={loading || !this.validSecret() || !isSecretDirty}
            onClick={this.handleSaveSecret}>
            <ContentSaveIcon />
          </Button>
        ) : (
          <Fragment>
            <Button
              spanProps={{
                className: classNames(classes.fab, classes.saveSecretSpan),
              }}
              tooltipProps={{ title: 'Save Secret' }}
              requiresAuth
              classes={{ root: classes.successIcon }}
              variant="round"
              className={classes.saveIcon}
              disabled={loading || !this.validSecret() || !isSecretDirty}
              onClick={this.handleSaveSecret}>
              <ContentSaveIcon />
            </Button>
            <SpeedDial>
              <SpeedDialAction
                requiresAuth
                tooltipOpen
                icon={<DeleteIcon />}
                onClick={onDialogActionOpen}
                classes={{
                  icon: classes.deleteIcon,
                  staticTooltipLabel: classes.deleteTooltipLabel,
                }}
                tooltipTitle="Delete Secret"
                FabProps={{
                  disabled: loading,
                }}
              />
            </SpeedDial>
          </Fragment>
        )}
        {dialogOpen && (
          <DialogAction
            open={dialogOpen}
            onSubmit={this.handleDeleteSecret}
            onComplete={onDialogActionComplete}
            onClose={onDialogActionClose}
            onError={onDialogActionError}
            error={dialogError}
            title="Delete Secret?"
            body={
              <Typography variant="body2">
                This will delete the secret {secretName}.
              </Typography>
            }
            confirmText="Delete Secret"
          />
        )}
      </Fragment>
    );
  }
}
