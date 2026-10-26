import { atom, read, update } from 'claude-code'
import type { Hook, Register } from 'claude-code'

import type { CriterionState, Finding, StepId } from './types'
import {
  NO_SWITCHES,
  addSwitch,
  askPrompt,
  costLine,
  creditOther,
  creditResponse,
  decide,
  family,
  guessSwitch,
  isMeasurable,
  isStillOurs,
  measureSwitch,
  measuredLine,
  modelLines,
  newLedger,
  opusRateOf,
  readSetting,
  readSpendReport,
  savingsLine,
  settleSwitch,
  skipSwitch,
  spendLine,
  stepLine,
  switchToast,
  totalLine,
} from './model'
import type { CacheUsage, SpendReport, SwitchEvent, SwitchTotal, Usage } from './model'
import { WORKFLOW_STEPS, parseScratchpad } from './parse'
import { CRITERION_ORDER, deriveView } from './view'
import type { Icon, StepRow } from './view'

type Api = Parameters<Hook<'session.start'>>[0]
type Options = Parameters<Register>[1]

const PANE = 'workflow'
const SCRATCHPAD = '.workflow/current-issue.md'
const POLL_MS = 3000
// A switch's toast carries what the cache loss cost, so it stays long enough to read.
const SWITCH_TOAST_MS = 15000
// How long one ledger credit may hold up the responses queued behind it.
const SETTLE_MS = 5000
const MAX_EDITS = 500
const DOCK_COLUMNS = 56
// Where the terminal docks a pane beside the transcript instead of above the prompt.
const DOCK_MIN_COLUMNS = 110

const snapshot = atom({ plugin: 'dev-workflow', key: 'snapshot' } as const, null)
const issue = atom({ plugin: 'dev-workflow', key: 'issue' } as const, null)
const edits = atom({ plugin: 'dev-workflow', key: 'edits' } as const, [])
const active = atom({ plugin: 'dev-workflow', key: 'active' } as const, null)
const autoOpened = atom({ plugin: 'dev-workflow', key: 'autoOpened' } as const, false)
// A total 1.11.0 stored (with `isGuess`) reads as none after a reload, rather than as a broken count.
const switches = atom({ plugin: 'dev-workflow', key: 'switches' } as const, NO_SWITCHES, { shape: 'switches-2' })
const started = atom({ plugin: 'dev-workflow', key: 'started' } as const, false)
// A ledger 1.12.0 stored (no `subagentUsd`, no `opusRate`) reads as none after a reload, and is seeded afresh.
const spend = atom({ plugin: 'dev-workflow', key: 'spend' } as const, null, { shape: 'spend-2' })
// The last switch that threw a warm cache away: its first request after says what was re-written.
const pendingSwitch = atom({ plugin: 'dev-workflow', key: 'pendingSwitch' } as const, null)

type Pending = { e: SwitchEvent; lead: string | null }

const STEP_IDS = new Set<string>(WORKFLOW_STEPS.map(d => d.id))

const SEVERITY: Record<string, string> = { C: '🔴', W: '🟡', S: '🔵' }

// The band's step marks, after the workflow-band mod.
const BAND = {
  done: { mark: '✓', color: 'success' },
  failed: { mark: '✗', color: 'error' },
  current: { mark: '▸', color: 'warning' },
  todo: { mark: '·', color: 'inactive' },
} as const

const SHORT: Partial<Record<StepId, string>> = { 'test-red': 'red', 'implement-green': 'green' }

const bandState = (s: StepRow, currentId: StepId | null): keyof typeof BAND =>
  s.icon === '✅' ? 'done' : s.icon === '❌' ? 'failed' : s.id === currentId ? 'current' : 'todo'

const findingIcon = (f: Finding): string =>
  f.state === 'fixed' ? '✅' : f.state === 'declined' ? '➖' : (SEVERITY[f.id.charAt(0)] ?? '•')

// The pane's colors, as theme keys so they follow the person's theme.
const TONE = {
  title: 'permission',
  heading: 'suggestion',
  meta: 'subtle',
  next: 'claude',
  empty: 'subtle',
} as const

const STEP_TONE: Record<Icon, string> = { '✅': 'success', '🔄': 'warning', '⬜': 'inactive', '❌': 'error' }

const CRITERION_TONE: Record<CriterionState, string> = {
  met: 'success',
  failed: 'error',
  partly: 'warning',
  unverified: 'suggestion',
  open: 'inactive',
}

// The breakdown line names each mark, so it doubles as the legend.
const CRITERION_MARK: Record<CriterionState, string> = { met: '✅', failed: '❌', partly: '🌓', unverified: '🔍', open: '⬜' }

// Inline, the room goes to the criteria that are broken or half done.
const isUrgent = (state: CriterionState): boolean => state === 'failed' || state === 'partly'

const SEVERITY_TONE: Record<string, string> = { C: 'error', W: 'warning', S: 'suggestion' }

const findingTone = (f: Finding): string =>
  f.state === 'fixed' ? 'success' : f.state === 'declined' ? 'inactive' : (SEVERITY_TONE[f.id.charAt(0)] ?? 'text')

// The skills whose frontmatter model the mod may follow.
const MODEL_SKILLS = /(^|:)(workflow-[a-z-]+|learn-code)$/
// $.store key: the default the mod's switches overwrote, for the next session to put back.
const RESTORE = 'restoreModel'

type Restore = { original: string; wrote: string }

// Module state: starts over with each reload, like the module's other variables.
let root: string | null = null
let seenMtime = -1
// What the mod's own switch announces; the cost toast of that switch carries it, so there is one toast.
let lead: string | null = null
// The ledger's credits, one at a time: each reads the cost and credits it in turn, so
// parallel responses cannot interleave and a lower cost only means a counter that restarted.
let settling: Promise<void> = Promise.resolve()

// The nearest ancestor of the session's cwd holding a scratchpad, not
// climbing past the repository root.
const locate = async ($: Api): Promise<string | null> => {
  let dir = await $.session.cwd()
  for (;;) {
    if (await $.fs.exists(`${dir}/${SCRATCHPAD}`)) return dir
    const up = dir.slice(0, dir.lastIndexOf('/')) || '/'
    if (up === dir || (await $.fs.exists(`${dir}/.git`))) return null
    dir = up
  }
}

const refresh = async ($: Api, isForced = false): Promise<void> => {
  root ??= await locate($)
  const path = root && `${root}/${SCRATCHPAD}`
  if (!path || !(await $.fs.exists(path))) {
    root = null
    seenMtime = -1
    // Only the change to "no scratchpad" is news; an idle poll writes nothing.
    if ((await read($, snapshot)) === null) return
    await update($, snapshot, () => null)
    return
  }
  const { mtimeMs } = await $.fs.stat(path)
  if (!isForced && mtimeMs === seenMtime) return
  seenMtime = mtimeMs

  const next = parseScratchpad(await $.fs.read(path))
  // Compared with the last issue seen, not the last snapshot: clarify moves the
  // old scratchpad away before writing the new one, and the poll sees the gap.
  const id = next.key ?? next.title
  const seen = await read($, issue)
  if (seen !== id) {
    if (seen !== null) {
      await update($, edits, () => [])
      await update($, active, () => null)
    }
    await update($, issue, () => id)
  }
  await update($, snapshot, () => next)
}

type SpendBlock = { lines: string[]; steps: string | null }

// The pane's spend lines for the level the setting names; null while off or not yet seeded.
const spendBlock = async ($: Api, options: Options): Promise<SpendBlock | null> => {
  const report = readSpendReport(options.spendReport)
  const ledger = await read($, spend)
  if (report === 'off' || ledger === null) return null
  const total = options.showSwitchCost !== false ? await read($, switches) : null
  const saved = savingsLine(ledger, total)

  return {
    lines: [spendLine(ledger, total), ...(saved === null ? [] : [saved]), ...(report === 'total' ? [] : modelLines(ledger))],
    steps: report === 'step' ? stepLine(ledger) : null,
  }
}

// The steps line may wrap, so it is counted as two rows.
const blockRows = (block: SpendBlock | null): number =>
  block === null ? 0 : block.lines.length + (block.steps === null ? 0 : 2)

type Hit = { model: string; usage: Usage; isSubagent: boolean }

// The option went off: the ledger kept while it was on goes.
const dropLedger = async ($: Api): Promise<void> => {
  if ((await read($, spend)) !== null) await update($, spend, () => null)
}

// What the session's cost rose by since the last credit goes to the ledger: to the
// response's model when `hit` is its stop chunk, else to `other` (a compaction,
// background calls). The first call after the setting turns on only seeds the baseline.
// A call the queue gave up on (`isLive` false) credits nothing: its cost read is stale.
// The switch total a new ledger starts from. A switch still waiting for its measuring response:
// when this call seeds the ledger on that very response, the response isn't credited, so the switch
// goes in the base as measured; when the response is still to come, it is the ledger's, and the
// switch stays out of the base.
const seedBase = async ($: Api, hit: Hit | undefined): Promise<SwitchTotal> => {
  const job = await read($, pendingSwitch)
  const total = await read($, switches)
  if (job === null) return total
  const measuring =
    hit === undefined || hit.isSubagent
      ? null
      : {
          model: hit.model,
          cache_read_input_tokens: hit.usage.cache_read_input_tokens ?? 0,
          cache_creation_input_tokens: hit.usage.cache_creation_input_tokens ?? 0,
        }

  return settleSwitch(total, job.e, measuring)
}

const settleNow = async ($: Api, hit: Hit | undefined, isLive: () => boolean): Promise<void> => {
  const cost = (await $.session.usage()).cost?.usd ?? null
  const step = (await read($, active)) ?? 'none'
  // Only a seeding call needs the base, so a running ledger skips the two reads. A call that found the
  // ledger running and then finds it gone was overtaken by the option going off: it seeds nothing.
  const base = (await read($, spend)) === null ? await seedBase($, hit) : null
  await update($, spend, ledger => {
    if (!isLive()) return ledger
    if (ledger === null) return base === null ? ledger : newLedger(cost ?? 0, base)

    return hit ? creditResponse(ledger, { ...hit, cost, step }) : creditOther(ledger, cost, step)
  })
}

// A failed credit leaves the queue running for the next one, and so does a hung one
// after SETTLE_MS: the responses waiting behind it go on, the late credit is dropped.
// Off (the default) has nothing to order, so it skips the queue and its timer.
const settle = ($: Api, report: SpendReport, hit?: Hit): Promise<void> => {
  if (report === 'off') return dropLedger($)
  settling = settling
    .then(
      () =>
        new Promise<void>(resolve => {
          let isLate = false
          const timer = $.clock.after(SETTLE_MS, () => {
            isLate = true
            resolve()
          })
          void settleNow($, hit, () => !isLate)
            .catch(() => undefined)
            .finally(() => {
              timer.cancel()
              resolve()
            })
        }),
    )
    .catch(() => undefined)

  return settling
}

// Asks for rows enough to list the plan inline, and a sidebar's width when docked.
const openPane = async ($: Api, options: Options) => {
  const snap = await read($, snapshot)
  const open = snap?.findings.filter(f => f.state === 'open').length ?? 0
  // A snapshot kept from before the five markers is not a list yet.
  const list = snap?.criteria
  const urgent = Array.isArray(list) ? list.filter(c => isUrgent(c.state)).length : 0
  const hasTotal = options.showSwitchCost !== false && totalLine(await read($, switches)) !== null
  const rows = Math.min(
    40,
    9 +
      (hasTotal ? 1 : 0) +
      blockRows(await spendBlock($, options)) +
      (snap?.plan.length ?? 0) +
      (open > 0 ? open + 2 : 0) +
      (urgent > 0 ? urgent + 2 : 0),
  )

  return $.ui.open({ id: PANE, title: 'Workflow', rows, columns: DOCK_COLUMNS })
}

const isRestore = (v: unknown): v is Restore =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as Restore).original === 'string' &&
  typeof (v as Restore).wrote === 'string'

// The `/config` Model row: the default new sessions start on.
const savedModel = async ($: Api): Promise<string | null> => {
  const row = (await $.config.list()).find(r => r.key === 'model')

  return typeof row?.value === 'string' ? row.value : null
}

// Setting the row switches the session and saves it as the default, so the
// default it replaced is kept for the next session to restore.
const switchModel = async ($: Api, skill: string, model: string): Promise<void> => {
  const kept = await $.store.get(RESTORE)
  const original = isRestore(kept) ? kept.original : await savedModel($)
  if (original !== null) await $.store.set(RESTORE, { original, wrote: model })

  const label = switchToast(skill, model)
  lead = label
  let deny: string | undefined
  let isAnnounced = false
  try {
    deny = (await $.config.set({ key: 'model', value: model })).deny
  } finally {
    // The cost toast took the label if it cleared it; a rejected call must not
    // leave it for an unrelated later switch.
    isAnnounced = lead === null
    lead = null
  }
  if (deny === undefined) {
    if (!isAnnounced) $.ui.toast(label, { timeoutMs: SWITCH_TOAST_MS })
    return
  }
  if (isRestore(kept)) await $.store.set(RESTORE, kept)
  else await $.store.delete(RESTORE)
  $.ui.toast(`Model not switched to ${model}: ${deny}`)
}

// The first main-loop request after a switch replaces the estimate with what it wrote.
// One on another model (a fallback) can't say, so the estimate stays, marked as a guess.
const reportMeasured = async ($: Api, job: Pending, usage: CacheUsage): Promise<void> => {
  if (!isMeasurable(job.e, usage)) {
    await update($, switches, total => guessSwitch(total, job.e))
    return
  }
  $.ui.toast(measuredLine(job.e, usage, job.lead ?? undefined), { timeoutMs: SWITCH_TOAST_MS })
  await update($, switches, total => measureSwitch(total, job.e, usage))
}

// Unless the person has chosen another default since. A full id the row
// refuses goes back as its family's alias.
const restoreDefault = async ($: Api): Promise<void> => {
  const entry = await $.store.get(RESTORE)
  if (!isRestore(entry)) return
  await $.store.delete(RESTORE)
  const current = await savedModel($)
  if (current === null || !isStillOurs(current, entry.wrote)) return

  const { deny } = await $.config.set({ key: 'model', value: entry.original })
  const alias = family(entry.original)
  if (deny !== undefined && alias !== null) await $.config.set({ key: 'model', value: alias })
}

// A failure here only costs the panel; it never reaches the skill or tool.
const guarded = async (run: () => Promise<unknown>): Promise<void> => {
  try {
    await run()
  } catch {
    // keep the last good state
  }
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await guarded(() =>
      $.command.register({
        name: 'workflow-panel',
        description: 'Show or hide the workflow status panel',
      }),
    )
    await guarded(() => refresh($, true))
    await guarded(() => settle($, readSpendReport(options.spendReport)))
    $.clock.every(POLL_MS, () => void guarded(() => refresh($)))
    // A reload runs session.start again in the same session, whose own switch
    // must not be undone; $.state outlives the reload, not the process.
    if (!(await read($, started))) {
      await update($, started, () => true)
      await guarded(() => restoreDefault($))
    }

    return next(e)
  })

  on('skill.prompt', { skill: /(^|:)workflow-[a-z-]+$/ }, async ($, e, next) => {
    await guarded(async () => {
      const step = (e.skill.split(':').pop() ?? '').replace(/^workflow-/, '')
      if (STEP_IDS.has(step)) {
        await update($, active, () => step as StepId)
      }
      await refresh($, true)
      if (options.autoOpen === true && (await read($, snapshot)) && !(await read($, autoOpened))) {
        await update($, autoOpened, () => true)
        await openPane($, options)
      }
    })

    return next(e)
  })

  // Before the skill's prompt reaches the model, so every turn of the skill runs
  // on its model (`suggest` asks first). Only this plugin's skills, and only one the person typed:
  // the one the model may invoke (workflow-branch) fires mid-turn, and a subagent's preload
  // carries no agent id here.
  on('skill.prompt', { skill: MODEL_SKILLS }, async ($, e, next) => {
    const fm: Record<string, unknown> = e.frontmatter
    const setting = readSetting(options.modelSwitch)
    // Plugin skills arrive namespaced (`dev-workflow:workflow-plan`) whether or not pluginName is set.
    const isOurs = e.pluginName === $.plugin.name || e.skill.startsWith(`${$.plugin.name}:`)
    if (setting !== 'off' && isOurs && fm['disable-model-invocation'] === true) {
      await guarded(async () => {
        const sessionModel = await $.session.model()
        const decision = decide({ setting, skillModel: fm.model, sessionModel, isMultiTurn: fm['multi-turn'] === true })
        if (decision.kind === 'switch') await switchModel($, e.skill, decision.model)
        if (decision.kind === 'suggest') {
          // The skill waits for the answer; a dismissed dialog rejects and leaves the model as it is.
          const ask = askPrompt(e.skill, decision.model, sessionModel)
          const answer = await $.ui.ask(ask.question, { options: [ask.switch, ask.stay], header: ask.header })
          if (answer === ask.switch) await switchModel($, e.skill, decision.model)
        }
      })
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: ['Write', 'Edit'] }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError === true) return ran

    await guarded(async () => {
      if (e.file_path.endsWith(`/${SCRATCHPAD}`)) {
        return refresh($, true)
      }
      root ??= await locate($)
      // Only edits made between planning and the written build status count.
      const snap = await read($, snapshot)
      const isBuilding = snap !== null && snap.plan.length > 0 && snap.written === null
      if (isBuilding && root && e.file_path.startsWith(`${root}/`)) {
        const rel = e.file_path.slice(root.length + 1)
        await update($, edits, list => (list.includes(rel) ? list : [...list, rel].slice(-MAX_EDITS)))
      }
    })

    return ran
  }).catch(($, e, next) => next(e))

  on('classic.CwdChanged', async ($, e, next) => {
    root = null
    seenMtime = -1
    await guarded(() => refresh($, true))

    return next(e)
  }).catch(($, e, next) => next(e))

  // Every model switch, the person's own included; a resume restores, it does not switch.
  on('classic.PostModelSwitch', async ($, e, next) => {
    if (e.source !== 'resume' && options.showSwitchCost !== false) {
      await guarded(async () => {
        const used = lead
        const line = costLine(e, used ?? undefined)
        const overtaken = await read($, pendingSwitch)
        if (overtaken !== null) {
          await update($, pendingSwitch, () => null)
          await update($, switches, total => skipSwitch(total, overtaken.e))
        }
        // Opus's price, for a ledger that has no Opus response to fit one from yet.
        const rate = opusRateOf(e)
        if (rate !== null && readSpendReport(options.spendReport) !== 'off') {
          await update($, spend, ledger => (ledger === null ? ledger : { ...ledger, opusRate: rate }))
        }
        if (line === null) return
        lead = null
        $.ui.toast(line, { timeoutMs: SWITCH_TOAST_MS })
        await update($, switches, total => addSwitch(total, e))
        if (e.prompt_cache_warm) {
          const { from_model, to_model, context_tokens, prompt_cache_warm, estimated_cache_write_usd, pricing } = e
          const job = { from_model, to_model, context_tokens, prompt_cache_warm, estimated_cache_write_usd, pricing }
          await update($, pendingSwitch, () => ({ e: job, lead: used }))
        }
      })
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  // Spend since the last response (between turns) is credited to `other` before the turn's responses.
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) await guarded(() => settle($, readSpendReport(options.spendReport)))

    return next(e)
  }).catch(($, e, next) => next(e))

  // A compaction spends without a response of its own.
  on('classic.PostCompact', async ($, e, next) => {
    await guarded(() => settle($, readSpendReport(options.spendReport)))

    return next(e)
  }).catch(($, e, next) => next(e))

  // Reads each response's usage on its way past; the response is passed on untouched.
  on('turn.step', async function* ($, e, next) {
    const stream = next(e)
    for await (const chunk of stream) {
      if (chunk.kind === 'stop' && chunk.usage !== null) {
        const { usage } = chunk
        const isSubagent = e.agentId !== undefined
        await guarded(() => settle($, readSpendReport(options.spendReport), { model: usage.model, usage, isSubagent }))
      }
      if (chunk.kind === 'stop' && chunk.usage !== null && e.agentId === undefined) {
        const usage = chunk.usage
        await guarded(async () => {
          const job = await read($, pendingSwitch)
          if (job === null) return
          await update($, pendingSwitch, () => null)
          // Turned off since the switch: the measurement is dropped, not shown.
          if (options.showSwitchCost !== false) await reportMeasured($, job, usage)
        })
      }
      yield chunk
    }

    return await stream.result
  })

  on('command.run', { command: 'workflow-panel' }, async ($, e) => {
    const pane = (await $.ui.panes()).find(p => p.id === PANE)
    // Open but behind another tab: opening again brings it forward.
    if (pane?.isShown) {
      await $.ui.close({ id: PANE })

      return { text: 'Workflow panel closed.' }
    }
    await guarded(() => refresh($, true))
    const opened = await openPane($, options)
    if (!opened.isPlaced) {
      return { text: `Workflow panel opened but not drawn: ${opened.reason}` }
    }
    const { isFullscreen, columns } = e.presentation

    const fix = !isFullscreen
      ? 'run /tui fullscreen (the classic renderer never docks a pane)'
      : `widen the terminal to ${DOCK_MIN_COLUMNS}+ columns (now ${columns})`

    return {
      text:
        isFullscreen && columns >= DOCK_MIN_COLUMNS
          ? 'Workflow panel opened as a right sidebar.'
          : `Workflow panel opened above the prompt. For a right sidebar, ${fix}.`,
    }
  })

  // Always-on band above the prompt: the issue and its workflow steps, on top of what other mods drew beneath.
  // Wrapped, not replaced: a replacing hook hides every band beneath it. Core's own drawing is left out, as 1.13.0
  // did: a probe saw a blank row with it, not told apart from the row the engine may keep under any band.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const snap = await read($, snapshot)
    if (e.props.hasSurvey || !snap) return below

    const { Box, Text } = $.ui.resolve(e)
    const view = deriveView(snap, await read($, edits), await read($, active))

    return (
      <Box flexDirection="column">
        <Text weight="bold" color={TONE.title} wrap="truncate">
          {[view.key, view.title].filter(Boolean).join(' · ')}
        </Text>
        <Box gap={1} flexWrap="wrap">
          {view.steps.map(s => {
            const state = bandState(s, view.currentId)
            return (
              <Text key={s.id} color={BAND[state].color} weight={state === 'current' ? 'bold' : 'regular'}>
                {BAND[state].mark}
                {SHORT[s.id] ?? s.id}
                {state === 'current' ? view.progress : ''}
              </Text>
            )
          })}
        </Box>
        {below.type === 'engine' ? null : below}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const snap = await read($, snapshot)
    const spent = options.showSwitchCost !== false ? totalLine(await read($, switches)) : null
    const block = await spendBlock($, options)
    const spendRows = block !== null && (
      <Box flexDirection="column">
        {block.lines.map(line => (
          <Text key={line} color={TONE.meta} wrap="truncate">
            {line}
          </Text>
        ))}
        {block.steps !== null && <Text color={TONE.meta}>{block.steps}</Text>}
      </Box>
    )

    if (!snap) {
      const empty = <Text color={TONE.empty}>No active workflow — start with /workflow-clarify</Text>

      return spent === null && block === null ? (
        empty
      ) : (
        <Box flexDirection="column">
          {empty}
          {spent !== null && <Text color={TONE.meta}>{spent}</Text>}
          {spendRows}
        </Box>
      )
    }

    const view = deriveView(snap, await read($, edits), await read($, active))
    // The band carries the workflow steps; the pane is the detail. Every plan
    // step is listed (the pane scrolls), briefs only when they fit.
    const isDocked = e.props.placement === 'dock'
    // Inline, settled findings fold into a count so the open ones keep the room.
    const openFindings = view.findings.filter(f => f.state === 'open')
    const listed = isDocked ? view.findings : openFindings
    const settled = view.findings.length - listed.length
    const { criteria } = view
    const met = criteria.counts.met
    const unmet = criteria.total - met
    const pending = isDocked ? criteria.pending : criteria.pending.filter(c => isUrgent(c.state))
    // Each list below the plan costs a blank line and a heading too.
    const lists =
      (view.findings.length > 0 ? listed.length + 2 + (settled > 0 ? 1 : 0) : 0) +
      (pending.length > 0 ? pending.length + 2 : 0)
    const fixed = 8 + (spent === null ? 0 : 1) + blockRows(block)
    const hasBrief = fixed + view.plan.length * 2 + lists <= e.props.scroll.bodyRows
    const subtitle = [view.mode === 'tdd' ? 'TDD' : view.mode === 'regular' ? 'Regular' : null, view.branch]
      .filter(Boolean)
      .join(' · ')

    return (
      <Box flexDirection="column">
        <Text weight="bold" color={TONE.title} wrap="truncate">
          {view.key ? `${view.key} · ` : ''}
          {view.title}
        </Text>
        {subtitle !== '' && (
          <Text color={TONE.meta} wrap="truncate">
            {subtitle}
          </Text>
        )}
        {spent !== null && (
          <Text color={TONE.meta} wrap="truncate">
            {spent}
          </Text>
        )}
        {spendRows}
        {criteria.total > 0 && (
          <Box gap={1} flexWrap="wrap">
            <Text color={met === criteria.total ? 'success' : 'warning'}>
              Criteria {met}/{criteria.total}
            </Text>
            {CRITERION_ORDER.filter(state => criteria.counts[state] > 0).map(state => (
              <Text key={state} color={CRITERION_TONE[state]}>
                · {CRITERION_MARK[state]} {criteria.counts[state]} {state}
              </Text>
            ))}
          </Box>
        )}
        {view.plan.length > 0 && (
          <Box flexDirection="column">
            <Text> </Text>
            <Text weight="bold" color={TONE.heading}>
              Plan ({view.plan.length} {view.planNoun})
            </Text>
            {view.plan.map(r => (
              <Box key={String(r.n)} flexDirection="column">
                <Box flexDirection="row">
                  <Text color={STEP_TONE[r.icon]}>
                    {r.inferred ? '~' : ''}
                    {r.icon} {r.n}
                    {' '}
                  </Text>
                  <Text dimColor={r.inferred} wrap="truncate">
                    {r.title}
                  </Text>
                </Box>
                {hasBrief && r.brief !== '' && (
                  <Text color={TONE.meta} dimColor wrap="truncate">
                    {'    '}
                    {r.brief}
                  </Text>
                )}
              </Box>
            ))}
          </Box>
        )}
        {view.findings.length > 0 && (
          <Box flexDirection="column">
            <Text> </Text>
            <Text weight="bold" color={TONE.heading}>
              Review ({openFindings.length} open of {view.findings.length})
            </Text>
            {listed.map(f => (
              <Box key={f.id} flexDirection="row">
                <Text color={findingTone(f)}>
                  {findingIcon(f)} {f.id}
                  {' '}
                </Text>
                <Text wrap="truncate">{f.title}</Text>
              </Box>
            ))}
            {settled > 0 && <Text color="success">✅ {settled} resolved</Text>}
          </Box>
        )}
        {pending.length > 0 && (
          <Box flexDirection="column">
            <Text> </Text>
            <Text weight="bold" color={TONE.heading}>
              Criteria ({pending.length < unmet ? `${pending.length} of ${unmet}` : unmet} not met)
            </Text>
            {pending.map((c, i) => (
              <Box key={String(i)} flexDirection="row">
                <Text color={CRITERION_TONE[c.state]}>{CRITERION_MARK[c.state]} </Text>
                <Text wrap="truncate">{c.text}</Text>
              </Box>
            ))}
          </Box>
        )}
        {view.next !== null && (
          <Box flexDirection="column">
            <Text> </Text>
            <Text color={TONE.next} wrap="truncate">
              ➡ Next: {view.next}
            </Text>
          </Box>
        )}
      </Box>
    )
  })
}
