import curriculum from '../curriculum.json' with { type: 'json' };

export const CURRICULUM = curriculum;

export function stagesFor(path) {
  return CURRICULUM[path]?.stages || [];
}
export function stageKeys(path) {
  return stagesFor(path).map((stage) => stage.key);
}

export function nextOpenStage(path, completedKeys) {
  const complete = new Set(completedKeys);
  return stageKeys(path).find((key) => !complete.has(key)) || null;
}

export function isKnownStage(path, stageKey) {
  return stageKeys(path).includes(stageKey);
}
