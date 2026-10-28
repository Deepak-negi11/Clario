import { FolderGit2, GitBranch, GitCommitHorizontal } from "lucide-react";

type Workspace = { project?: string; branch?: string; commit?: string };

/**
 * Where a player's agent is working: project folder, git branch and short commit,
 * shown in their agent card. Renders nothing when the hook doesn't share them.
 */
export function AgentWorkspace({ project, branch, commit }: Workspace) {
  if (!project && !branch && !commit) return null;

  return (
    // Wraps instead of squeezing: a long branch moves to its own line rather than shrinking to "feat/…".
    <dl className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] leading-4 text-slate-500" translate="no">
      {project && (
        <div className="flex min-w-0 max-w-full items-center gap-1" title={project}>
          <dt className="shrink-0">
            <FolderGit2 aria-hidden className="h-3 w-3 text-slate-400" strokeWidth={2} />
            <span className="sr-only">Project</span>
          </dt>
          <dd className="truncate font-semibold text-slate-700">{project}</dd>
        </div>
      )}
      {branch && (
        <div className="flex min-w-0 max-w-full items-center gap-1" title={branch}>
          <dt className="shrink-0">
            <GitBranch aria-hidden className="h-3 w-3 text-slate-400" strokeWidth={2} />
            <span className="sr-only">Branch</span>
          </dt>
          <dd className="truncate">{branch}</dd>
        </div>
      )}
      {commit && (
        <div className="flex shrink-0 items-center gap-1">
          <dt className="shrink-0">
            <GitCommitHorizontal aria-hidden className="h-3 w-3 text-slate-400" strokeWidth={2} />
            <span className="sr-only">Commit</span>
          </dt>
          <dd>{commit}</dd>
        </div>
      )}
    </dl>
  );
}
