// Student curriculum service. Assembles the member's path (A = 8 pillars, B = 4 weeks / 28 days) from
// the Curriculum table, joined with Progress, and computes server-side sequential gating: a
// stage is `active` only when every prior stage is `complete` — otherwise `locked`. The gate
// is enforced here on read AND on submit (Arch §9.2 — the client never decides eligibility).
//
// Demo note: submitting a deliverable marks the stage `complete` (self-paced proof of work).
// Production inserts an admin-verify step (submitted -> verifiedBy/At -> complete).

import * as content from '../repositories/content.mjs';
import * as progressRepo from '../repositories/progress.mjs';
import * as stageLocksRepo from '../repositories/stageLocks.mjs';
import * as audit from '../repositories/audit.mjs';

export class StageLockedError extends Error {
  constructor() {
    super('Stage is locked: complete the prior stage first.');
    this.name = 'StageLockedError';
    this.code = 'stage_locked';
    this.httpStatus = 403;
  }
}

export function pathKeyFor(member) {
  return member.path === 'B_fast_track' ? 'B_fast_track' : 'A_full_roadmap';
}

function orderStages(pathKey, items) {
  const stages = items.filter((i) => i.stageKey !== '_meta');
  if (pathKey === 'A_full_roadmap') {
    return stages
      .sort((a, b) => a.n - b.n)
      .map((s) => ({
        stageKey: s.stageKey,
        order: s.n,
        kind: 'pillar',
        title: `Pillar ${s.n} · ${s.title}`,
        description: s.description,
        items: s.milestones,
      }));
  }
  return stages.sort((a, b) => a.week - b.week);
}

function requirementList(deliverable = '') {
  const text = String(deliverable).trim();
  if (!text) return [];
  const labels = [
    'Key insight',
    'Pick ONE',
    'Set up',
    'Read',
    'Exercise',
    'Study',
    'Learn',
    'Calculate',
    'Build',
    'Apply',
    'Draw',
    'Use',
    'Implement',
    'Test',
    'Add',
    'Logging',
    'Run',
    'Document',
    'Deploy',
    'Post',
    'Rewrite',
    'Create',
    'Practice',
    'Identify',
    'Send',
    'Write',
    'Record',
    'Compare',
    'Review',
  ];
  const labelPattern = labels.map((l) => l.replace(/\s/g, '\\s+')).join('|');
  const colonPattern = new RegExp(`\\b(${labelPattern})\\b:`, 'g');
  const startPattern = new RegExp(`^(${labelPattern})\\b:?`);
  const matches = [...text.matchAll(colonPattern)].map((match) => ({ index: match.index }));
  if (!matches.length) return [text];
  if (matches[0].index !== 0 && startPattern.test(text)) matches.unshift({ index: 0 });

  return matches
    .map((match, i) => text.slice(match.index, matches[i + 1]?.index ?? text.length).trim())
    .filter(Boolean);
}

function dayStageKey(weekKey, day) {
  return `${weekKey}-day${day}`;
}

function withSequentialState(units, byStage, byLock) {
  let priorAllComplete = true;
  return units.map((s) => {
    const p = byStage.get(s.stageKey);
    const lock = byLock.get(s.stageKey);
    const isComplete = p?.state === 'complete';
    const state = isComplete
      ? 'complete'
      : lock?.state === 'locked'
        ? 'locked'
        : lock?.state === 'unlocked'
          ? 'active'
          : priorAllComplete
            ? 'active'
            : 'locked';
    priorAllComplete = priorAllComplete && isComplete;
    return {
      ...s,
      state,
      lockOverride: lock?.state || null,
      lockUpdatedAt: lock?.updatedAt || null,
      deliverableUrl: p?.deliverableUrl || null,
      completedAt: p?.verifiedAt || null,
      checkedTasks: Array.isArray(p?.checkedTasks) ? p.checkedTasks : [],
    };
  });
}

function weekState(days) {
  if (days.every((d) => d.state === 'complete')) return 'complete';
  if (days.some((d) => ['complete', 'active'].includes(d.state))) return 'active';
  return 'locked';
}

function fastTrackView(weeks, byStage, byLock) {
  const orderedWeeks = weeks.sort((a, b) => a.week - b.week);
  const dayUnits = orderedWeeks.flatMap((week) =>
    (week.days || []).map((d) => ({
      stageKey: dayStageKey(week.stageKey, d.day),
      order: d.day,
      kind: 'day',
      weekKey: week.stageKey,
      week: week.week,
      weekTitle: `Week ${week.week} · ${week.focus}`,
      title: `Day ${d.day} - ${d.topic}`,
      topic: d.topic,
      description: d.deliverable,
      requirements: requirementList(d.deliverable),
    })),
  );
  const days = withSequentialState(dayUnits, byStage, byLock);
  const stages = orderedWeeks.map((week) => {
    const weekDays = days.filter((d) => d.weekKey === week.stageKey);
    const completed = weekDays.filter((d) => d.state === 'complete').length;
    return {
      stageKey: week.stageKey,
      order: week.week,
      kind: 'week',
      title: `Week ${week.week} · ${week.focus}`,
      description: week.focus,
      state: weekState(weekDays),
      completed,
      total: weekDays.length,
      activeDay: weekDays.find((d) => d.state === 'active') || null,
      items: weekDays.map((d) => d.title),
      days: weekDays,
    };
  });

  return { stages, stageUnits: days, activeStage: days.find((d) => d.state === 'active') || null };
}

export async function getPathView(member) {
  const pathKey = pathKeyFor(member);
  const items = await content.getPath(pathKey);
  const meta = items.find((i) => i.stageKey === '_meta') || {};
  const ordered = orderStages(pathKey, items);

  const progress = await progressRepo.listProgress(member.memberId);
  const byStage = new Map(progress.map((p) => [p.stageKey, p]));
  const locks = await stageLocksRepo.listLocks(member.memberId);
  const byLock = new Map(locks.map((l) => [l.stageKey, l]));

  const pathView =
    pathKey === 'B_fast_track'
      ? fastTrackView(ordered, byStage, byLock)
      : {
          stages: withSequentialState(ordered, byStage, byLock),
          stageUnits: null,
          activeStage: null,
        };
  const stageUnits = pathView.stageUnits || pathView.stages;
  const activeStage = pathView.activeStage || stageUnits.find((s) => s.state === 'active') || null;

  const completed = stageUnits.filter((s) => s.state === 'complete').length;
  return {
    pathKey,
    meta: { title: meta.title || pathKey, duration: meta.duration || '' },
    stages: pathView.stages,
    stageUnits,
    activeStage,
    completed,
    total: stageUnits.length,
    progressPct: stageUnits.length ? Math.round((100 * completed) / stageUnits.length) : 0,
  };
}

export function normalizeDeliverableUrl(deliverableUrl) {
  const raw = String(deliverableUrl || '').trim();
  if (!raw) return null;
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    const plausibleHost = parsed.hostname === 'localhost' || parsed.hostname.includes('.');
    if (!['http:', 'https:'].includes(parsed.protocol) || !plausibleHost) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export async function submitStage(member, stageKey, deliverableUrl) {
  const normalizedUrl = normalizeDeliverableUrl(deliverableUrl);
  if (!normalizedUrl) {
    const e = new Error('A deliverable URL (http/https) is required.');
    e.httpStatus = 400;
    e.code = 'invalid_deliverable';
    throw e;
  }

  // Re-derive gating server-side; never trust the client about which stage is open.
  const view = await getPathView(member);
  const stage = view.stageUnits.find((s) => s.stageKey === stageKey);
  if (!stage) {
    const e = new Error('Unknown stage.');
    e.httpStatus = 404;
    e.code = 'not_found';
    throw e;
  }
  if (stage.state === 'locked') throw new StageLockedError();

  const now = new Date().toISOString();
  await progressRepo.putProgress({
    memberId: member.memberId,
    stageKey,
    state: 'complete', // demo: self-attested; prod = submitted -> admin verify -> complete
    deliverableUrl: normalizedUrl,
    verifiedBy: 'self',
    verifiedAt: now,
  });
  await audit.append({
    actorId: member.memberId,
    actorRole: 'student',
    action: 'STAGE_COMPLETED',
    targetType: 'stage',
    targetId: `${member.memberId}#${stageKey}`,
    after: { status: 'complete' },
  });

  return getPathView(member);
}

// Number of requirement ticks a stage exposes (mirrors the client's requirementsFor).
function requirementCount(stage) {
  if (stage.requirements?.length) return stage.requirements.length;
  if (stage.items?.length) return stage.items.length;
  return 1;
}

// Persist the per-stage proof-of-work checkbox ticks (UI progress) to the Progress table.
// Re-derives gating server-side: locked stages are rejected; completed stages are left untouched.
export async function saveStageTasks(member, stageKey, checked) {
  const view = await getPathView(member);
  const stage = view.stageUnits.find((s) => s.stageKey === stageKey);
  if (!stage) {
    const e = new Error('Unknown stage.');
    e.httpStatus = 404;
    e.code = 'not_found';
    throw e;
  }
  if (stage.state === 'locked') throw new StageLockedError();

  const count = requirementCount(stage);
  const checkedTasks = [
    ...new Set((Array.isArray(checked) ? checked : []).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < count)),
  ].sort((a, b) => a - b);

  if (stage.state !== 'complete') {
    const existing = await progressRepo.getStageProgress(member.memberId, stageKey);
    await progressRepo.putProgress({
      ...(existing || {}),
      memberId: member.memberId,
      stageKey,
      state: existing?.state === 'complete' ? 'complete' : 'active',
      checkedTasks,
      updatedAt: new Date().toISOString(),
    });
  }
  return getPathView(member);
}

export async function setStageOverride(member, stageKey, state, { actorId }) {
  if (!['locked', 'unlocked', 'auto'].includes(state)) {
    const e = new Error('Stage override must be locked, unlocked, or auto.');
    e.httpStatus = 400;
    e.code = 'invalid_stage_override';
    throw e;
  }

  const view = await getPathView(member);
  const stage = view.stageUnits.find((s) => s.stageKey === stageKey);
  if (!stage) {
    const e = new Error('Unknown stage.');
    e.httpStatus = 404;
    e.code = 'not_found';
    throw e;
  }
  if (stage.state === 'complete' && state !== 'auto') {
    const e = new Error('Completed stages cannot be locked or unlocked.');
    e.httpStatus = 409;
    e.code = 'stage_complete';
    throw e;
  }

  if (state === 'auto') {
    await stageLocksRepo.deleteLock(member.memberId, stageKey);
  } else {
    await stageLocksRepo.putLock({
      memberId: member.memberId,
      stageKey,
      state,
      updatedAt: new Date().toISOString(),
      updatedBy: actorId,
    });
  }
  await audit.append({
    actorId,
    actorRole: 'admin',
    action: `STAGE_${state.toUpperCase()}`,
    targetType: 'stage',
    targetId: `${member.memberId}#${stageKey}`,
    after: { status: state },
  });
  return getPathView(member);
}
