import React, { Fragment, useState } from 'react';
import { useQuery } from '@apollo/client';
import { withStyles } from '@material-ui/core/styles';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ArrowExpandVerticalIcon from 'mdi-react/ArrowExpandVerticalIcon';
import LinkIcon from 'mdi-react/LinkIcon';
import { parse, stringify } from 'qs';
import Spinner from '../../../components/Spinner';
import CodeEditor from '../../../components/CodeEditor';
import HelpView from '../../../components/HelpView';
import Dashboard from '../../../components/Dashboard/index';
import Button from '../../../components/Button';
import ErrorPanel from '../../../components/ErrorPanel';
import splitLines from '../../../utils/splitLines';
import Link from '../../../utils/Link';
import scopesetQuery from './scopeset.graphql';
import scopeLink from '../../../utils/scopeLink';

const styles = theme => ({
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
});

function ScopesetExpander({ classes, location, history }) {
  const query = parse(location.search.slice(1));
  const initialScopes = query.scopes;
  const [scopeText, setScopeText] = useState(
    initialScopes ? initialScopes.join('\n') : ''
  );
  const [scopes, setScopes] = useState(undefined);
  const { loading, error, data } = useQuery(scopesetQuery, {
    variables: { scopes },
    skip: !scopes,
  });
  const handleExpandScopesClick = () => {
    const newScopes = splitLines(scopeText);
    const queryObj = { scopes: newScopes };
    const queryStr = stringify(queryObj);

    history.push({
      pathname: '/auth/scopes/expansions',
      search: queryStr,
    });

    setScopes(newScopes);
  };

  const description = `This tool allows you to find the expanded copy of a given scopeset, with
    scopes implied by any roles included.`;

  return (
    <Dashboard
      title="Expand Scopes"
      helpView={<HelpView description={description} />}>
      <Fragment>
        <CodeEditor
          className={classes.editor}
          onChange={setScopeText}
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
              {data &&
                data.expandScopes &&
                data.expandScopes.map(scope => (
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
          variant="round"
          onClick={handleExpandScopesClick}>
          <ArrowExpandVerticalIcon />
        </Button>
      </Fragment>
    </Dashboard>
  );
}

export default withStyles(styles)(ScopesetExpander);
