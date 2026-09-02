import React, { Component, Fragment } from 'react';
import { withStyles } from '@material-ui/core/styles';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ArrowExpandVerticalIcon from 'mdi-react/ArrowExpandVerticalIcon';
import LinkIcon from 'mdi-react/LinkIcon';
import { parse, stringify } from 'qs';
import { Auth } from '@taskcluster/client-web';
import Spinner from '../../../components/Spinner';
import CodeEditor from '../../../components/CodeEditor';
import HelpView from '../../../components/HelpView';
import Dashboard from '../../../components/Dashboard/index';
import Button from '../../../components/Button';
import ErrorPanel from '../../../components/ErrorPanel';
import splitLines from '../../../utils/splitLines';
import Link from '../../../utils/Link';
import scopeLink from '../../../utils/scopeLink';
import { withTaskclusterClient } from '../../../utils/TaskclusterClient';

@withTaskclusterClient
@withStyles(theme => ({
  actionButton: {
    ...theme.mixins.fab,
  },
  editor: {
    marginBottom: theme.spacing(2),
  },
  title: {
    marginBottom: theme.spacing(2),
  },
  listItemButton: {
    ...theme.mixins.listItemButton,
    paddingTop: theme.spacing(0.5),
    paddingBottom: theme.spacing(0.5),
    display: 'flex',
    justifyContent: 'space-between',
  },
}))
export default class ScopesetExpander extends Component {
  constructor(props) {
    super(props);

    const query = parse(this.props.location.search.slice(1));
    const scopes = query.scopes ? [].concat(query.scopes) : null;

    this.state = {
      scopeText: scopes ? scopes.join('\n') : '',
      scopes: null,
      expandedScopes: null,
      loading: false,
      error: null,
    };
  }

  get authClient() {
    return this.props.createTaskclusterClient({ Class: Auth });
  }

  expandScopes = async scopes => {
    this.setState({ scopes, loading: true, error: null });

    try {
      const { scopes: expandedScopes } = await this.authClient.expandScopes({
        scopes,
      });

      this.setState({ expandedScopes, loading: false, error: null });
    } catch (error) {
      this.setState({ expandedScopes: null, loading: false, error });
    }
  };

  handleExpandScopesClick = () => {
    const scopes = splitLines(this.state.scopeText);
    const queryStr = stringify({ scopes });

    this.props.history.push({
      pathname: '/auth/scopes/expansions',
      search: queryStr,
    });

    this.expandScopes(scopes);
  };

  handleScopesChange = scopeText => {
    this.setState({ scopeText });
  };

  render() {
    const { classes } = this.props;
    const { scopes, scopeText, expandedScopes, loading, error } = this.state;
    const description = `This tool allows you to find the expanded copy of a given scopeset, with
    scopes implied by any roles included.`;

    return (
      <Dashboard
        title="Expand Scopes"
        helpView={<HelpView description={description} />}>
        <CodeEditor
          className={classes.editor}
          onChange={this.handleScopesChange}
          placeholder="new-scope:for-something:*"
          mode="scopemode"
          value={scopeText}
        />
        {scopes && (
          <Fragment>
            <ErrorPanel error={error} />
            <List dense>
              {loading && (
                <ListItem>
                  <Spinner />
                </ListItem>
              )}
              {expandedScopes?.map(scope => (
                <Link key={scope} to={scopeLink(scope)}>
                  <ListItem button className={classes.listItemButton}>
                    <code>{scope}</code>
                    <LinkIcon size={16} />
                  </ListItem>
                </Link>
              ))}
            </List>
          </Fragment>
        )}
        <Button
          tooltipProps={{ title: 'Expand Scopes' }}
          spanProps={{ className: classes.actionButton }}
          color="secondary"
          variant="circular"
          onClick={this.handleExpandScopesClick}>
          <ArrowExpandVerticalIcon />
        </Button>
      </Dashboard>
    );
  }
}
