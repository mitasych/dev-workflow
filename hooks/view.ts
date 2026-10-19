import type { Finding, Mode, Snapshot, StepId } from '../types'
import { WORKFLOW_STEPS } from './parse'

export type Icon = '✅' | '🔄' | '⬜' | '❌'

export type StepRow = {
  id: StepId
  label: string
  icon: Icon
  detail: string
}

export type PlanRow = {
  n: number
  title: string
  brief: string
  icon: Icon
  /** Guessed from observed file edits, not written by a skill. */
  inferred: boolean
}

export type View = {
  key: string | null
  title: string
  mode: Mode | null
  branch: string | null
  steps: StepRow[]
  planNoun: 'steps' | 'cycles'
  plan: PlanRow[]
  criteria: { done: number; total: number }
  findings: Finding[]
  next: string | null
  /** The step being worked or next up; null once released. */
  currentId: StepId | null
  /** Plan progress while building (` ~3/5`, `~` when guessed); else empty. */
  progress: string
}

const BUILD_STEPS: readonly StepId[] = ['implement', 'implement-green']

const norm = (p: string): string => p.replace(/^\.\//, '')

const planRows = (snap: Snapshot, edits: ReadonlySet<string>): PlanRow[] => {
  const items = [...snap.plan].sort((a, b) => a.n - b.n)
  // What a skill wrote always wins over what the edits suggest.
  if (snap.written) {
    let left = snap.written.done
    return items.map(({ n, title, brief }) => {
      if (snap.written?.blocked.includes(n)) return { n, title, brief, icon: '❌', inferred: false }
      const done = left > 0
      if (done) left -= 1
      return { n, title, brief, icon: done ? '✅' : '⬜', inferred: false }
    })
  }
  return items.map(({ n, title, brief, files }) => {
    const touched = files.filter(f => edits.has(norm(f))).length
    const icon: Icon = touched === 0 ? '⬜' : touched === files.length ? '✅' : '🔄'
    return { n, title, brief, icon, inferred: touched > 0 }
  })
}

export const deriveView = (
  snap: Snapshot,
  editedPaths: readonly string[],
  active: StepId | null,
): View => {
  const edits = new Set(editedPaths.map(norm))
  const present = new Set(snap.present)
  const rejected = snap.verdict?.startsWith('❌') ?? false

  const steps: StepRow[] = WORKFLOW_STEPS.filter(d => snap.mode === null || d.modes.includes(snap.mode)).map(d => {
    const icon: Icon =
      d.id === 'review' && present.has('review') && rejected
        ? '❌'
        : present.has(d.id)
          ? '✅'
          : active === d.id
            ? '🔄'
            : '⬜'
    const noun = snap.mode === 'tdd' ? 'cycles' : 'steps'
    const detail =
      d.id === 'plan' && snap.plan.length > 0
        ? `${snap.plan.length} ${noun}`
        : BUILD_STEPS.includes(d.id) && snap.written
          ? `${snap.written.done}/${snap.written.total}`
          : ''
    return { id: d.id, label: d.label, icon, detail }
  })

  const plan = planRows(snap, edits)
  // A release closes the issue, whatever steps it skipped on the way.
  const isReleased = present.has('release')
  const current = isReleased
    ? undefined
    : (steps.find(s => s.icon === '🔄') ?? steps.find(s => s.icon === '⬜' || s.icon === '❌'))
  const pending = isReleased ? undefined : steps.find(s => s.icon === '⬜')
  const command = WORKFLOW_STEPS.find(d => d.id === pending?.id)?.command

  let progress = ''
  if (current && BUILD_STEPS.includes(current.id) && plan.length > 0) {
    const guessed = plan.some(r => r.inferred)
    progress = ` ${guessed ? '~' : ''}${plan.filter(r => r.icon === '✅').length}/${plan.length}`
  }

  return {
    key: snap.key,
    title: snap.title,
    mode: snap.mode,
    branch: snap.branch,
    steps,
    planNoun: snap.mode === 'tdd' ? 'cycles' : 'steps',
    plan,
    criteria: snap.criteria,
    findings: snap.findings,
    currentId: current?.id ?? null,
    progress,
    next: isReleased
      ? null
      : rejected
        ? 'Review requested changes — fix them, then re-run /workflow-review'
        : (command ?? null),
  }
}
