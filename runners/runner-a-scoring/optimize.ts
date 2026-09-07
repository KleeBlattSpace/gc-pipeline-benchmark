import fs from 'node:fs/promises';
import path from 'node:path';
import { calculateScoringLoss, parseGroundTruth } from './loss-functions.js';

const truth = parseGroundTruth(JSON.parse(await fs.readFile(path.join(process.cwd(), 'public/benchmark/ground-truth.json'), 'utf8')));
const candidates: Record<string, number>[] = [
  { perfect: 97, pattern: 86, blur: 84, border: 65, watermark: 55, broken_seam: 48 },
  { perfect: 95, pattern: 88, blur: 82, border: 60, watermark: 50, broken_seam: 45 },
];
const best = candidates.map((weights) => truth.reduce((sum, tile) => sum + calculateScoringLoss(weights[tile.category] ?? 50, tile.expected_gate), 0)).map((loss, index) => ({ loss, weights: candidates[index] })).sort((a, b) => a.loss - b.loss)[0];
await fs.mkdir(path.join(process.cwd(), 'config'), { recursive: true });
await fs.writeFile(path.join(process.cwd(), 'config/tunable-scoring.json'), JSON.stringify({ version: '0.1.0-baseline', ...best }, null, 2) + '\n');
console.log(`Best scoring candidate loss: ${best.loss}`);
