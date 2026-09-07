export type Gate = 'Production' | 'Review' | 'Reject';

export type TruthTile = {
  tile_id: string;
  category: string;
  expected_gate: Gate;
  expected_score_range?: [number, number];
};

const GATES = new Set<Gate>(['Production', 'Review', 'Reject']);

export function gateForScore(score: number): Gate {
  return score >= 92 ? 'Production' : score >= 78 ? 'Review' : 'Reject';
}

export function calculateScoringLoss(predictedScore: number, groundTruthGate: Gate): number {
  const margin = groundTruthGate === 'Production' ? predictedScore - 92 : groundTruthGate === 'Review' ? Math.min(predictedScore - 78, 92 - predictedScore) : 78 - predictedScore;
  if (margin >= 0) return 0;
  const isFalsePositive = groundTruthGate !== 'Production' && predictedScore >= 92;
  return (isFalsePositive ? 3 : 1) * Math.abs(margin) ** 2;
}

function asGate(value: unknown, tileId: string): Gate {
  if (typeof value === 'string' && GATES.has(value as Gate)) return value as Gate;
  throw new Error(`invalid expected_gate for ${tileId}`);
}

function asRange(value: unknown): [number, number] | undefined {
  if (!Array.isArray(value) || value.length < 2) return undefined;
  const lo = Number(value[0]);
  const hi = Number(value[1]);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return undefined;
  return [lo, hi];
}

function asTile(tileId: string, entry: unknown): TruthTile {
  if (!entry || typeof entry !== 'object') throw new Error(`invalid ground-truth entry ${tileId}`);
  const record = entry as Record<string, unknown>;
  if (typeof record.category !== 'string' || !record.category) throw new Error(`missing category for ${tileId}`);
  return {
    tile_id: typeof record.tile_id === 'string' && record.tile_id ? record.tile_id : tileId,
    category: record.category,
    expected_gate: asGate(record.expected_gate, tileId),
    expected_score_range: asRange(record.expected_score_range),
  };
}

/**
 * Accepts both ground-truth schemas:
 *   v1: { tiles: [ { tile_id, category, expected_gate }, ... ] }
 *   v2: { "<size>/<file>.png": { category, expected_gate, expected_score_range, ... }, ... }
 * scripts/generate-ground-truth.mjs emits v2; the v1 branch keeps older fixtures readable.
 */
export function parseGroundTruth(raw: unknown): TruthTile[] {
  if (!raw || typeof raw !== 'object') throw new Error('ground-truth.json is not an object');
  const record = raw as Record<string, unknown>;
  if (Array.isArray(record.tiles)) return record.tiles.map((entry, index) => asTile(`tile[${index}]`, entry));
  return Object.entries(record).map(([tileId, entry]) => asTile(tileId, entry));
}
