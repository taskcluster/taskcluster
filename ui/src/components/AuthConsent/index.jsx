import React, { Component } from 'react';
import { withRouter } from 'react-router-dom';
import { array, shape, func, string } from 'prop-types';
import classNames from 'classnames';
import { addYears } from 'date-fns';
import { withStyles } from '@material-ui/core/styles';
import CardHeader from '@material-ui/core/CardHeader';
import Typography from '@material-ui/core/Typography';
import TextField from '@material-ui/core/TextField';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import ExpansionPanel from '@material-ui/core/ExpansionPanel';
import ExpansionPanelSummary from '@material-ui/core/ExpansionPanelSummary';
import ExpansionPanelDetails from '@material-ui/core/ExpansionPanelDetails';
import ExpandMoreIcon from 'mdi-react/ExpandMoreIcon';
import CheckIcon from 'mdi-react/CheckIcon';
import CloseIcon from 'mdi-react/CloseIcon';
import Button from '../Button';
import DatePicker from '../DatePicker';
import { date } from '../../utils/prop-types';
import logo from '../../images/brandLogo.png';

@withRouter
@withStyles(theme => ({
  header: {
    paddingLeft: 0,
  },
  list: {
    width: '100%',
  },
  fab: {
    ...theme.mixins.fab,
  },
  allowIcon: {
    ...theme.mixins.successIcon,
  },
  denySpanProps: {
    right: theme.spacing(11),
  },
}))
export default class AuthConsent extends Component {
  static propTypes = {
    transactionID: string.isRequired,
    registeredClientId: string.isRequired,
    clientId: string.isRequired,
    onExpirationChange: func.isRequired,
    onInputChange: func.isRequired,
    onScopesChange: func.isRequired,
    formData: shape({
      expires: date,
      description: string,
      scopes: array,
    }).isRequired,
  };

  handleScopeTextChange = ({ target: { value } }) => {
    this.props.onScopesChange(value.split('\n'));
  };

  render() {
    const {
      classes,
      registeredClientId,
      transactionID,
      clientId,
      onExpirationChange,
      onInputChange,
      formData: { expires, description, scopes },
    } = this.props;
    const scopeText = scopes.join('\n');

    return (
      <form action="/login/oauth/authorize/decision" method="post">
        <input name="transaction_id" type="hidden" value={transactionID} />
        <input name="scope" type="hidden" value={scopes.join(' ')} />
        <input name="clientId" type="hidden" value={clientId} />
        <div>
          <CardHeader
            className={classes.header}
            component="div"
            avatar={<img alt="Logo" height={40} src={logo} />}
            title={registeredClientId}
            subheader={
              <span>
                is requesting access to client ID <code>{clientId}</code>
              </span>
            }
          />
          <ExpansionPanel elevation={2} defaultExpanded>
            <ExpansionPanelSummary
              expandIcon={<ExpandMoreIcon />}
              aria-controls="panel1a-content"
              id="panel1a-header">
              <Typography variant="body2" className={classes.heading}>
                Client Details
              </Typography>
            </ExpansionPanelSummary>
            <ExpansionPanelDetails>
              <List className={classes.list}>
                <ListItem>
                  <ListItemText
                    primary="Description"
                    secondary={
                      <TextField
                        name="description"
                        onChange={onInputChange}
                        fullWidth
                        multiline
                        rows={5}
                        value={description}
                      />
                    }
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Expires"
                    secondary={
                      <DatePicker
                        name="expires"
                        value={expires}
                        onChange={onExpirationChange}
                        maxDate={addYears(new Date(), 1001)}
                      />
                    }
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Scopes"
                    secondary={
                      <TextField
                        helperText="Enter each scope on its own line"
                        onChange={this.handleScopeTextChange}
                        fullWidth
                        multiline
                        spellCheck={false}
                        placeholder="new-scope:for-something:*"
                        value={scopeText}
                      />
                    }
                  />
                </ListItem>
              </List>
            </ExpansionPanelDetails>
          </ExpansionPanel>
        </div>
        <Button
          type="submit"
          name="cancel"
          value="Deny"
          tooltipProps={{ title: 'Deny' }}
          variant="round"
          color="secondary"
          spanProps={{
            className: classNames(classes.fab, classes.denySpanProps),
          }}>
          <CloseIcon color="secondary" />
        </Button>
        <Button
          type="submit"
          tooltipProps={{ title: 'Allow' }}
          classes={{ root: classes.allowIcon }}
          variant="round"
          spanProps={{ className: classes.fab }}>
          <CheckIcon />
        </Button>
      </form>
    );
  }
}
