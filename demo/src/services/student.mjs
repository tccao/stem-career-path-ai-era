// Student curriculum service. Assembles the member's path (A = 8 pillars, B = 4 weeks) from
// the Curriculum table, joined with Progress, and computes server-side sequential gating: a
// stage is `active` only when every prior stage is `complete` — otherwise `locked`. The gate
// is enforced here on read AND on submit (Arch §9.2 — the client never decides eligibility).
//
// Demo note: submitting a deliverable marks the stage `complete` (self-paced proof of work).
// Production inserts an admin-verify step (submitted -> verifiedBy/At -> complete).

import * as content from '../repositories/content.mjs';
import * as progressRepo from '../repositories/progress.mjs';
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
  return stages
    .sort((a, b) => a.week - b.week)
    .map((s) => ({
      stageKey: s.stageKey,
      order: s.week,
      kind: 'week',
      title: `Week ${s.week} · ${s.focus}`,
      description: s.focus,
      items: (s.days || []).map((d) => `Day ${d.day} — ${d.topic}: ${d.deliverable}`),
    }));
}

export async function getPathView(member) {
  const pathKey = pathKeyFor(member);
  const items = await content.getPath(pathKey);
  const meta = items.find((i) => i.stageKey === '_meta') || {};
  const ordered = orderStages(pathKey, items);

  const progress = await progressRepo.listProgress(member.memberId);
  const byStage = new Map(progress.map((p) => [p.stageKey, p]));

  let priorAllComplete = true;
  const stages = ordered.map((s) => {
    const p = byStage.get(s.stageKey);
    const isComplete = p?.state === 'complete';
    const state = isComplete ? 'complete' : priorAllComplete ? 'active' : 'locked';
    priorAllComplete = priorAllComplete && isComplete;
    return {
      ...s,
      state,
      deliverableUrl: p?.deliverableUrl || null,
      completedAt: p?.verifiedAt || null,
    };
  });

  const completed = stages.filter((s) => s.state === 'complete').length;
  return {
    pathKey,
    meta: { title: meta.title || pathKey, duration: meta.duration || '' },
    stages,
    completed,
    total: stages.length,
    progressPct: stages.length ? Math.round((100 * completed) / stages.length) : 0,
  };
}

export async function submitStage(member, stageKey, deliverableUrl) {
  if (!deliverableUrl || !/^https?:\/\/\S+/.test(deliverableUrl)) {
    const e = new Error('A deliverable URL (http/https) is required.');
    e.httpStatus = 400;
    e.code = 'invalid_deliverable';
    throw e;
  }

  // Re-derive gating server-side; never trust the client about which stage is open.
  const view = await getPathView(member);
  const stage = view.stages.find((s) => s.stageKey === stageKey);
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
    deliverableUrl,
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
