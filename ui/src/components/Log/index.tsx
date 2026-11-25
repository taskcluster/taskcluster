import { type ReactNode, useEffect, useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { findNext, findPrevious } from '@codemirror/search';
import { type EditorView, runScopeHandlers } from '@codemirror/view';
import ArrowDownBoldCircleOutlineIcon from 'mdi-react/ArrowDownBoldCircleOutlineIcon';
import ChevronDownIcon from 'mdi-react/ChevronDownIcon';
import ChevronUpIcon from 'mdi-react/ChevronUpIcon';
import FilterVariantIcon from 'mdi-react/FilterVariantIcon';
import MagnifyIcon from 'mdi-react/MagnifyIcon';
import NumericIcon from 'mdi-react/NumericIcon';
import db from '../../utils/db';
import Spinner from '../Spinner';
import {
  createLogEditor,
  highlightField,
  type LogStatus,
  selectLines,
} from './editor';
import { formatLineHash, parseLineHash, sameRange } from './hash';
import { goToLine, setFollow } from './scroll';
import { setFilter, setQuery } from './search';
import { streamLog } from './stream';
import { logStyles } from './theme';

const SEARCH_MIN_LENGTH = 3;
const TOOLBAR_BUTTON_SX = {
  width: 31,
  height: 25,
  minWidth: 'unset',
  padding: '0 6px',
};

const PREFERENCES = db.table<boolean, string>('userPreferences');
const FOLLOW_PREFERENCE = 'follow-log';

export interface LogProps {
  url: string;
  hash?: string;
  onHashChange?: (hash: string) => void;
  onError?: (error: Error) => void;
  actions?: ReactNode;
}

export default function Log({
  url,
  hash = '',
  onHashChange,
  onError,
  actions,
}: LogProps) {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const latest = useRef({ hash, onHashChange, onError });
  const [view, setView] = useState<EditorView | null>(null);
  const [status, setStatus] = useState<LogStatus | null>(null);
  const [load, setLoad] = useState<{ done: boolean; error?: Error }>({
    done: false,
  });
  const [followPref, setFollowPref] = useState<boolean | undefined>();
  const [input, setInput] = useState('');
  const query = input.length >= SEARCH_MIN_LENGTH ? input : '';

  useEffect(() => {
    latest.current = { hash, onHashChange, onError };
  });

  useEffect(() => {
    let cancelled = false;

    PREFERENCES.get(FOLLOW_PREFERENCE)
      .catch(() => undefined)
      .then(pref => {
        if (!cancelled) {
          setFollowPref(pref ?? true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (followPref === undefined || !containerRef.current) {
      return;
    }

    const view = createLogEditor({
      parent: containerRef.current,
      follow: followPref,
      highlight: parseLineHash(latest.current.hash),
      onStatus: setStatus,
      onHighlight: range =>
        latest.current.onHashChange?.(formatLineHash(range)),
      onFocusSearch: () => {
        searchRef.current?.focus();
        searchRef.current?.select();
      },
    });

    setView(view);

    return () => {
      view.destroy();
      setView(null);
    };
  }, [followPref]);

  useEffect(() => {
    if (!view) {
      return;
    }

    const controller = new AbortController();
    const { signal } = controller;

    view.dispatch({ changes: { from: 0, to: view.state.doc.length } });
    setLoad({ done: false });
    streamLog(view, url, signal).then(
      () => {
        if (!signal.aborted) {
          setLoad({ done: true });
        }
      },
      (error: Error) => {
        if (!signal.aborted) {
          setLoad({ done: true, error });
          latest.current.onError?.(error);
        }
      }
    );

    return () => controller.abort();
  }, [view, url]);

  useEffect(() => {
    const range = parseLineHash(hash);

    if (view && !sameRange(range, view.state.field(highlightField))) {
      view.dispatch({ effects: selectLines(range) });
    }
  }, [view, hash]);

  useEffect(() => {
    if (!view) {
      return;
    }

    const timeout = setTimeout(() => setQuery(view, query), 200);

    return () => clearTimeout(timeout);
  }, [view, query]);

  const follow = status?.follow ?? false;
  const handleFollowClick = () => {
    PREFERENCES.put(!follow, FOLLOW_PREFERENCE).catch(() => {});
    view?.dispatch({ effects: setFollow.of(!follow) });
  };

  const handleFilterClick = () => {
    if (view) {
      setQuery(view, query);
      view.dispatch({ effects: setFilter.of(!status?.filter) });
    }
  };

  const handleFindNext = (direction: 1 | -1) => {
    if (view) {
      setQuery(view, query);
      (direction === 1 ? findNext : findPrevious)(view);
    }
  };

  const matchLabel = query && status ? `${status.matches} matches` : '';

  return (
    <Box
      tabIndex={-1}
      onKeyDown={e => {
        if (
          view &&
          !e.defaultPrevented &&
          runScopeHandlers(view, e.nativeEvent, 'editor')
        ) {
          e.preventDefault();
        }
      }}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: { xs: 'calc(100vh - 56px)', sm: 'calc(100vh - 64px)' },
        outline: 'none',
      }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 1,
          px: 2,
          py: 1,
        }}>
        <Tooltip title="Go to Line">
          <Button
            size="small"
            color="secondary"
            sx={TOOLBAR_BUTTON_SX}
            onClick={() => view && goToLine(view)}>
            <NumericIcon size={20} />
          </Button>
        </Tooltip>
        <Tooltip title={follow ? 'Unfollow Log' : 'Follow Log'}>
          <Button
            size="small"
            color={follow ? 'inherit' : 'secondary'}
            sx={[TOOLBAR_BUTTON_SX, follow && theme.mixins.successIcon]}
            onClick={handleFollowClick}>
            <ArrowDownBoldCircleOutlineIcon />
          </Button>
        </Tooltip>
        <TextField
          size="small"
          placeholder="Search"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleFindNext(e.shiftKey ? -1 : 1);
            }
          }}
          slotProps={{
            htmlInput: { 'aria-label': 'Search log', ref: searchRef },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <MagnifyIcon size={18} />
                </InputAdornment>
              ),
            },
          }}
          sx={{ width: 260 }}
        />
        <Typography
          variant="body2"
          color="textSecondary"
          sx={{ minWidth: 90, fontFamily: 'monospace' }}>
          {matchLabel}
        </Typography>
        <Tooltip title="Previous match (Shift+Enter)">
          <span>
            <IconButton
              size="small"
              aria-label="Previous match"
              disabled={!status?.matches}
              onClick={() => handleFindNext(-1)}>
              <ChevronUpIcon />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Next match (Enter)">
          <span>
            <IconButton
              size="small"
              aria-label="Next match"
              disabled={!status?.matches}
              onClick={() => handleFindNext(1)}>
              <ChevronDownIcon />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Show only matching lines" describeChild>
          <span>
            <IconButton
              size="small"
              aria-label="Show only matching lines"
              aria-pressed={status?.filter ?? false}
              disabled={!query}
              sx={[Boolean(status?.filter) && theme.mixins.successIcon]}
              onClick={handleFilterClick}>
              <FilterVariantIcon />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
      {load.error && (
        <Alert severity="error" sx={{ mx: 2, mb: 1 }}>
          An error occurred while loading the log: {load.error.message}
        </Alert>
      )}
      <Box sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <Box ref={containerRef} sx={logStyles} />
        {!load.done && (status?.empty ?? true) && (
          <Spinner
            loading
            sx={{ position: 'absolute', top: 24, left: 0, right: 0 }}
          />
        )}
      </Box>
      {actions}
    </Box>
  );
}
