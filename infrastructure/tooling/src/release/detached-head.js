import { gitIsDirty, gitCurrentBranch, gitDescribe, gitCheckout, gitResetHard } from '../utils/index.js';

const defaultGit = {
  isDirty: gitIsDirty,
  currentBranch: gitCurrentBranch,
  headRevision: async ({ dir }) => (await gitDescribe({ dir })).revision,
  checkout: gitCheckout,
  resetHard: gitResetHard,
};

/**
 * Run `run()` on a detached HEAD at the current commit, then return the
 * checkout to the branch (or sha, if already detached) it started on.
 *
 * Anything `run()` commits lands on the detached HEAD only, so the original
 * branch is never modified.  If `run()` fails, tracked changes it left behind
 * are discarded with `git reset --hard` before returning.
 *
 * - dir -- repository directory
 * - run -- async function to run while detached; its result is returned
 * - git -- git operations (defaults to the utils/git.js helpers)
 * - log -- logger for restore failures
 */
export const withDetachedHead = async ({ dir, run, git = defaultGit, log = console.error }) => {
  // This check must pass before HEAD is touched: it is what makes the
  // `reset --hard` below safe, since it proves nothing uncommitted can be lost.
  if (await git.isDirty({ dir })) {
    throw new Error(
      'The current git working copy is not clean.  Staging releases can only be made from a clean working copy.'
    );
  }

  const { ref } = await git.currentBranch({ dir });
  const original = ref === 'HEAD' ? await git.headRevision({ dir }) : ref;

  await git.checkout({ dir, detach: true });

  let result;
  try {
    result = await run();
  } catch (err) {
    try {
      // Safe only because the tree was verified clean before detaching:
      // this discards nothing but the partial release-task edits.
      await git.resetHard({ dir });
      await git.checkout({ dir, ref: original });
    } catch (restoreErr) {
      // keep the original error; report the restore failure separately
      log(`Failed to return to ${original}: ${restoreErr.message}`);
    }
    throw err;
  }

  await git.checkout({ dir, ref: original });
  return result;
};
