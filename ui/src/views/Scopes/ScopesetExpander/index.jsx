import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import { withStyles } from '@material-ui/core/styles';
import ArrowExpandVerticalIcon from 'mdi-react/ArrowExpandVerticalIcon';
import LinkIcon from 'mdi-react/LinkIcon';
import { parse, stringify } from 'qs';
import { Component, Fragment } from 'react';
import { Query } from 'react-apollo';
import Button from '../../../components/Button';
import CodeEditor from '../../../components/CodeEditor';
import Dashboard from '../../../components/Dashboard/index';
import ErrorPanel from '../../../components/ErrorPanel';
import HelpView from '../../../components/HelpView';
import Spinner from '../../../components/Spinner';
import Link from '../../../utils/Link';
import scopeLink from '../../../utils/scopeLink';
import splitLines from '../../../utils/splitLines';
import scopesetQuery from './scopeset.graphql';

@withStyles((theme) => ({
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
    const { scopes } = query;

    if (scopes) {
      this.state = {
        scopeText: scopes.join('\n'),
      };
    } else {
      this.state = {
        scopeText: '',
      };
    }
  }

  handleExpandScopesClick = async () => {
    const scopes = splitLines(this.state.scopeText);
    const queryObj = { scopes };
    const queryStr = stringify(queryObj);

    this.props.history.push({
      pathname: '/auth/scopes/expansions',
      search: queryStr,
    });

    this.setState({ scopes });
  };

  handleScopesChange = (scopeText) => {
    this.setState({ scopeText });
  };

  render() {
    const { classes } = this.props;
    const { scopes, scopeText } = this.state;
    const description = `This tool allows you to find the expanded copy of a given scopeset, with
    scopes implied by any roles included.`;

    return (
      <Dashboard title="Expand Scopes" helpView={<HelpView description={description} />}>
        <Fragment>
          <CodeEditor
            className={classes.editor}
            onChange={this.handleScopesChange}
            placeholder="new-scope:for-something:*"
            mode="scopemode"
            value={scopeText}
          />
          {scopes && (
            <Query query={scopesetQuery} variables={{ scopes }}>
              {({ loading, error, data }) => (
                <Fragment>
                  <ErrorPanel error={error} />
                  <List dense>
                    {loading && (
                      <ListItem>
                        <Spinner />
                      </ListItem>
                    )}
                    {data?.expandScopes?.map((scope) => (
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
            </Query>
          )}
          <Button
            tooltipProps={{ title: 'Expand Scopes' }}
            spanProps={{ className: classes.actionButton }}
            color="secondary"
            variant="round"
            onClick={this.handleExpandScopesClick}
          >
            <ArrowExpandVerticalIcon />
          </Button>
        </Fragment>
      </Dashboard>
    );
  }
}
