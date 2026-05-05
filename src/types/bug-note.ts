export type BugStatus = 'OPEN' | 'SOLVED';

export interface BugContext {
  module?: string;
  page?: string;
  component?: string;
  function?: string;
}

/** Reserved for future AI / logs / stack traces; v1 UI does not set this. */
export type BugMeta = Record<string, unknown>;

export interface BugNote {
  id: string;
  title: string;
  description: string | null;
  status: BugStatus;
  screenshotPath: string | null;
  context: BugContext | null;
  meta: BugMeta | null;
  createdAt: number;
  updatedAt: number;
}
