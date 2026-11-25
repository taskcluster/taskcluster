import { useState } from 'react';
import { dump, load } from 'js-yaml';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import CodeEditor from '../CodeEditor';
import DialogAction from '../DialogAction';
import JsonDisplay from '../JsonDisplay';
import yamlSchema from '../../utils/yamlSchema';

export interface HookTriggerDialogProps {
  open?: boolean;
  hookGroupId: string;
  hookId: string;
  triggerSchema: object;
  error?: unknown;
  /** Called with the parsed context when the user confirms. */
  onTrigger: (context: unknown) => Promise<unknown>;
  onComplete?: () => void;
  onClose?: () => void;
  onError?: (error: unknown) => void;
}

const panelSx = {
  display: 'flex',
  flexDirection: 'column',
  height: { md: '100%' },
  '& > :last-child': { flex: 1, minHeight: 0, overflow: 'auto', margin: 0 },
};

export default function HookTriggerDialog({
  open,
  hookGroupId,
  hookId,
  triggerSchema,
  error,
  onTrigger,
  onComplete,
  onClose,
  onError,
}: HookTriggerDialogProps) {
  const [context, setContext] = useState(() => dump({}));

  if (!open) {
    return null;
  }

  return (
    <DialogAction
      fullScreen
      open
      onSubmit={() => onTrigger(load(context, { schema: yamlSchema }))}
      onComplete={onComplete}
      onClose={onClose}
      onError={onError}
      error={error}
      confirmText="Trigger Hook"
      body={
        <>
          <Typography variant="body2" gutterBottom>
            Trigger Hook{' '}
            <code>
              {hookGroupId}/{hookId}
            </code>{' '}
            with the following context:
          </Typography>
          <Grid
            container
            spacing={2}
            sx={{ flex: { md: 1 }, minHeight: { md: 0 } }}>
            <Grid size={{ sm: 12, md: 6, lg: 6 }} sx={panelSx}>
              <Typography gutterBottom variant="subtitle1">
                Context
              </Typography>
              <CodeEditor
                mode="yaml"
                lint
                value={context}
                onChange={setContext}
              />
            </Grid>
            <Grid size={{ sm: 12, md: 6, lg: 6 }} sx={panelSx}>
              <Typography gutterBottom variant="subtitle1">
                Schema
              </Typography>
              <JsonDisplay syntax="yaml" objectContent={triggerSchema} />
            </Grid>
          </Grid>
        </>
      }
    />
  );
}
