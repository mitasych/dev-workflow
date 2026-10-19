import type { Finding, Mode, PlanItem, Snapshot, StepId, Written } from '../types'

export type StepDef = {
  id: StepId
  label: string
  command: string
  /** Scratchpad heading the step's skill writes, matched as a prefix. */
  heading: string
  modes: readonly Mode[]
}

// Mirrors the section table in skills/workflow-status/SKILL.md, in the
// order workflow-help documents each path. Keep the two in step.
export const WORKFLOW_STEPS: readonly StepDef[] = [
  { id: 'clarify', label: 'Clarify', command: '/workflow-clarify', heading: '# Issue:', modes: ['regular', 'tdd'] },
  { id: 'plan', label: 'Plan', command: '/workflow-plan', heading: '## Implementation Plan', modes: ['regular', 'tdd'] },
  { id: 'implement', label: 'Implement', command: '/workflow-implement', heading: '## Implementation Status', modes: ['regular'] },
  { id: 'test', label: 'Test', command: '/workflow-test', heading: '## Test Status', modes: ['regular'] },
  { id: 'test-red', label: 'Test (Red)', command: '/workflow-test-red', heading: '## Test Red Status', modes: ['tdd'] },
  { id: 'implement-green', label: 'Implement (Green)', command: '/workflow-implement-green', heading: '## Implement Green Status', modes: ['tdd'] },
  { id: 'refactor', label: 'Refactor', command: '/workflow-refactor', heading: '## Refactor Status', modes: ['tdd'] },
  { id: 'review', label: 'Review', command: '/workflow-review', heading: '## Code Review', modes: ['regular', 'tdd'] },
  { id: 'document', label: 'Document', command: '/workflow-document', heading: '## Documentation Status', modes: ['regular', 'tdd'] },
  { id: 'release', label: 'Release', command: '/workflow-release', heading: '## Release', modes: ['regular', 'tdd'] },
]

export const emptySnapshot = (): Snapshot => ({
  key: null,
  title: '',
  branch: null,
  mode: null,
  present: [],
  verdict: null,
  criteria: { done: 0, total: 0 },
  plan: [],
  written: null,
  findings: [],
})

type Section = { level: number; title: string; heading: string; lines: string[] }

const KEY = /(?<![A-Za-z0-9])[A-Z]{2,}-\d+(?!\d)/
const BRIEF_MAX = 200

const safe = <T>(fn: () => T, fallback: T): T => {
  try {
    return fn()
  } catch {
    return fallback
  }
}

/** Headings outside fenced code, each with the lines up to the next heading. */
const sectionsOf = (md: string): Section[] => {
  const out: Section[] = []
  let inFence = false
  for (const line of md.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence
    }
    const m = inFence ? null : /^(#{1,6})\s+(.*\S)\s*$/.exec(line)
    if (m) {
      out.push({ level: (m[1] ?? '').length, title: m[2] ?? '', heading: line.trim(), lines: [] })
    } else {
      out[out.length - 1]?.lines.push(line)
    }
  }
  return out
}

/** `heading` is a prefix of `line`, ending at a word boundary. */
const startsWithHeading = (line: string, heading: string): boolean =>
  line.startsWith(heading) && !/[A-Za-z0-9]/.test(line.charAt(heading.length))

const field = (lines: readonly string[], name: string): string | null => {
  const re = new RegExp(`^\\*\\*${name}\\*\\*:\\s*(.*\\S)\\s*$`)
  for (const line of lines) {
    const m = re.exec(line)
    if (m) return m[1] ?? null
  }
  return null
}

const lastOf = (sections: readonly Section[], heading: string): Section | undefined =>
  [...sections].reverse().find(s => startsWithHeading(s.heading, heading))

const firstSentence = (text: string): string => {
  const plain = text.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim()
  const cut = plain.split(/(?<=[a-z)`][.!?])\s+(?=[A-Z])/)[0] ?? plain
  return cut.length > BRIEF_MAX ? `${cut.slice(0, BRIEF_MAX - 1)}…` : cut
}

/** A bullet's text plus its indented continuation lines. */
const bulletText = (lines: readonly string[], label: string): string | null => {
  const start = lines.findIndex(l => new RegExp(`^\\s*[-*]\\s+\\*\\*${label}\\*\\*:`).test(l))
  if (start < 0) return null
  const parts = [(lines[start] ?? '').replace(new RegExp(`^\\s*[-*]\\s+\\*\\*${label}\\*\\*:\\s*`), '')]
  for (const line of lines.slice(start + 1)) {
    if (!/^\s{2,}\S/.test(line) || /^\s*[-*]\s/.test(line)) break
    parts.push(line.trim())
  }
  return parts.join(' ')
}

const planItems = (plan: Section | undefined, sections: readonly Section[]): PlanItem[] => {
  if (!plan) return []
  const from = sections.indexOf(plan)
  const items: PlanItem[] = []
  for (const s of sections.slice(from + 1)) {
    if (s.level <= plan.level) break
    const m = /^(?:Step|Cycle)\s+(\d+)\s*:\s*(.+)$/.exec(s.title)
    if (!m) continue
    const text = bulletText(s.lines, 'Action') ?? bulletText(s.lines, 'Minimal change') ?? ''
    const files = (bulletText(s.lines, 'Files') ?? '').match(/`[^`]+`/g) ?? []
    items.push({
      n: Number(m[1]),
      title: (m[2] ?? '').trim(),
      brief: firstSentence(text),
      files: files.map(f => f.slice(1, -1)).filter(f => /[./]/.test(f)),
    })
  }
  return items
}

const writtenProgress = (sections: readonly Section[]): Written | null => {
  const found = ['## Implementation Status', '## Implement Green Status']
    .map(h => lastOf(sections, h))
    .filter((s): s is Section => s !== undefined)
    .sort((a, b) => sections.indexOf(b) - sections.indexOf(a))[0]
  if (!found) return null
  const counts = /(\d+)\s+of\s+(\d+)/.exec(
    field(found.lines, 'Steps completed') ?? field(found.lines, 'Cycles completed') ?? '',
  )
  if (!counts) return null
  const blockedText = field(found.lines, 'Blocked steps') ?? ''
  const blocked = /^none/i.test(blockedText) ? [] : (blockedText.match(/\d+/g) ?? []).map(Number)
  return { done: Number(counts[1]), total: Number(counts[2]), blocked }
}

const FINDING = /^\s*[-*]\s+\[([CWS]\d+)\]\s+(.+)$/

/** The latest review's `[C1]`/`[W1]`/`[S1]` bullets, each settled by a later
 *  `## Review Fixes` section that names it (as a bullet or in a list). */
const findings = (sections: readonly Section[]): Finding[] => {
  const review = lastOf(sections, '## Code Review')
  if (!review) return []
  const from = sections.indexOf(review)
  const after = sections.slice(from + 1)
  const ownEnd = after.findIndex(s => s.level <= review.level)
  const own = [review, ...(ownEnd < 0 ? after : after.slice(0, ownEnd))]

  let inFixes = false
  const fixes: string[] = []
  for (const s of after) {
    if (s.level <= 2) inFixes = startsWithHeading(s.heading, '## Review Fixes')
    if (inFixes) fixes.push(s.heading, ...s.lines)
  }
  const fixText = fixes.join('\n')

  const out: Finding[] = []
  for (const line of own.flatMap(s => s.lines)) {
    const m = FINDING.exec(line)
    if (!m) continue
    const id = m[1] ?? ''
    if (out.some(f => f.id === id)) continue
    // "W2 declined" (no other ID in between), or a "Declined: W2, S1" list
    const declined = new RegExp(
      `\\b${id}\\b(?:(?![CWS]\\d)[^\\n,;])*\\bdeclined|declined[*\\s]*:[^\\n]*\\b${id}\\b`,
      'i',
    )
    const named = new RegExp(`\\b${id}\\b`)
    out.push({
      id,
      title: (m[2] ?? '').split(' — ')[0]?.replace(/\.$/, '').trim() ?? '',
      state: declined.test(fixText) ? 'declined' : named.test(fixText) ? 'fixed' : 'open',
    })
  }
  return out
}

const criteria = (sections: readonly Section[]): { done: number; total: number } => {
  const s = lastOf(sections, '## Acceptance Criteria')
  const boxes = (s?.lines ?? []).map(l => /^\s*[-*]\s+\[([ xX])\]/.exec(l)?.[1])
  const marked = boxes.filter((b): b is string => b !== undefined)
  return { done: marked.filter(b => b !== ' ').length, total: marked.length }
}

/** Reads a scratchpad into what the panel draws. Never throws: each part
 *  that cannot be read falls back to its empty value. */
export const parseScratchpad = (md: string): Snapshot => {
  const empty = emptySnapshot()
  const sections = safe(() => sectionsOf(md), [])
  if (sections.length === 0) return empty

  const issue = sections.find(s => startsWithHeading(s.heading, '# Issue:'))
  const title = issue ? issue.title.replace(/^Issue:\s*/, '') : ''
  const header = issue?.lines ?? []
  const source = field(header, 'Source')
  const branch = field(header, 'Branch')

  const plan = lastOf(sections, '## Implementation Plan')
  const modeText = plan ? field(plan.lines, 'Mode') ?? '' : ''
  const mode: Mode | null = /^tdd/i.test(modeText) ? 'tdd' : /^regular/i.test(modeText) ? 'regular' : null

  const review = lastOf(sections, '## Code Review')
  // A verdict stops counting once later work answers it.
  const isAnswered = (r: Section): boolean =>
    sections.slice(sections.indexOf(r) + 1).some(
      s =>
        startsWithHeading(s.heading, '## Review Fixes') ||
        WORKFLOW_STEPS.some(
          d => ['test', 'document', 'release'].includes(d.id) && startsWithHeading(s.heading, d.heading),
        ),
    )

  return {
    key: [source, title, branch].map(t => KEY.exec(t ?? '')?.[0]).find(Boolean) ?? null,
    title,
    branch,
    mode,
    present: safe(
      () => WORKFLOW_STEPS.filter(d => sections.some(s => startsWithHeading(s.heading, d.heading))).map(d => d.id),
      empty.present,
    ),
    verdict: review && !isAnswered(review) ? field(review.lines, 'Verdict') : null,
    criteria: safe(() => criteria(sections), empty.criteria),
    plan: safe(() => planItems(plan, sections), empty.plan),
    written: safe(() => writtenProgress(sections), empty.written),
    findings: safe(() => findings(sections), empty.findings),
  }
}
