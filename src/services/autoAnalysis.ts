import { CytometryMath } from './cytometryMath';
import type { FCSFile, FCSParameter, Gate, PopulationStats } from '../types/cytometry';

export interface AutomaticAnalysis {
  gates: Gate[];
  populations: PopulationStats[];
  warnings: string[];
  tCount?: number;
  bCount?: number;
  tIggMedian?: number;
  bIggMedian?: number;
}

function channel(file: FCSFile, pattern: RegExp): FCSParameter | undefined {
  return file.parameters.find(p => pattern.test(p.name) || pattern.test(p.stain) || pattern.test(p.shortName));
}

function values(file: FCSFile, parameter: FCSParameter, indices: Uint32Array): number[] {
  const events = file.isCompensated && file.compensatedEvents ? file.compensatedEvents : file.events;
  const step = Math.max(1, Math.ceil(indices.length / 20000));
  const result: number[] = [];
  for (let i = 0; i < indices.length; i += step) {
    const n = events[indices[i] * file.parameters.length + parameter.index];
    if (Number.isFinite(n)) result.push(n);
  }
  return result;
}

function quantile(data: number[], fraction: number): number {
  if (!data.length) return NaN;
  const ordered = data.sort((a, b) => a - b);
  const pos = (ordered.length - 1) * fraction;
  const low = Math.floor(pos);
  const high = Math.ceil(pos);
  return ordered[low] + (ordered[high] - ordered[low]) * (pos - low);
}

/** Otsu in arcsinh space: exploratory threshold, not a validated phenotype cutoff. */
function estimateThreshold(file: FCSFile, param: FCSParameter, indices: Uint32Array): number | null {
  const data = values(file, param, indices).map(v => Math.asinh(v / 150));
  if (data.length < 100) return null;
  const min = quantile([...data], 0.01), max = quantile([...data], 0.99);
  if (!(max - min > 0.25)) return null;
  const bins = new Float64Array(128);
  for (const n of data) bins[Math.max(0, Math.min(127, Math.floor((n - min) / (max - min) * 128)))]++;
  let sum = 0;
  for (let i = 0; i < 128; i++) sum += i * bins[i];
  let back = 0, backSum = 0, best = -1, cutoff = -1;
  for (let i = 0; i < 127; i++) {
    back += bins[i]; backSum += bins[i] * i;
    const front = data.length - back;
    if (back < data.length * .03 || front < data.length * .03) continue;
    const between = back * front * Math.pow(backSum / back - (sum - backSum) / front, 2);
    if (between > best) { best = between; cutoff = i; }
  }
  return cutoff < 0 ? null : 150 * Math.sinh(min + (cutoff + 1) / 128 * (max - min));
}

/** Runs real, per-file computations. These gates are suggested, not clinically validated. */
export function analyzeFCS(file: FCSFile): AutomaticAnalysis {
  const gates: Gate[] = [], populations: PopulationStats[] = [];
  const warnings = ['Gates sugeridos automáticamente: requieren revisión visual. No equivalen a un resultado clínico.'];
  const all = Uint32Array.from({ length: file.metadata.totalEvents }, (_, i) => i);
  let parent: Uint32Array = all, parentId: string | null = null;
  const add = (gate: Gate) => {
    const result = CytometryMath.evaluateGate(file, gate, parent);
    gates.push(gate); populations.push(result.stats);
    parent = result.indices; parentId = gate.id;
  };
  const fsc = channel(file, /^FSC[-_ ]?A$/i), ssc = channel(file, /^SSC[-_ ]?A$/i);
  const fsch = channel(file, /^FSC[-_ ]?H$/i);
  const cd3 = channel(file, /CD3(?!\d)/i), cd19 = channel(file, /CD19(?!\d)/i);
  const igg = channel(file, /IGG(?!\d)/i);

  if (fsc && ssc) {
    const x = values(file, fsc, all), y = values(file, ssc, all);
    const minX = quantile(x, .1), maxX = quantile(x, .95);
    const minY = quantile(y, .05), maxY = quantile(y, .85);
    if (minX < maxX && minY < maxY) add({
      id: 'auto_scatter', name: 'FSC/SSC central (sugerido)', color: '#6366f1',
      parentId: null, type: 'rectangle', xParam: fsc.name, yParam: ssc.name,
      xTransform: 'linear', yTransform: 'linear',
      rectangleBounds: { minX, maxX, minY, maxY }, isAutoGate: true,
    });
  } else warnings.push('Sin FSC-A y SSC-A: no se creó gate morfológico.');

  if (fsc && fsch && parent.length >= 100) {
    const a = values(file, fsc, parent), h = values(file, fsch, parent);
    const ratios = a.map((v, i) => v > 0 ? h[i] / v : NaN).filter(Number.isFinite);
    if (ratios.length >= 100) {
      const median = quantile([...ratios], .5);
      const mad = quantile(ratios.map(r => Math.abs(r - median)), .5);
      const low = Math.max(0, median - Math.max(.08, 3 * mad));
      const high = median + Math.max(.08, 3 * mad);
      const start = quantile([...a], .01), end = quantile([...a], .99);
      if (start < end && low < high) add({
        id: 'auto_singlets', name: 'Singlets estimados FSC-H/A', color: '#10b981',
        parentId, type: 'polygon', xParam: fsc.name, yParam: fsch.name,
        xTransform: 'linear', yTransform: 'linear',
        polygonPoints: [
          { x: start, y: start * low }, { x: end, y: end * low },
          { x: end, y: end * high }, { x: start, y: start * high },
        ], isAutoGate: true,
      });
    }
  } else warnings.push('No se estimaron singlets; se requiere FSC-A y FSC-H.');

  let tCount: number | undefined, bCount: number | undefined;
  let tIggMedian: number | undefined, bIggMedian: number | undefined;
  if (cd3 && cd19 && parent.length >= 100) {
    const tCut = estimateThreshold(file, cd3, parent);
    const bCut = estimateThreshold(file, cd19, parent);
    if (tCut !== null && bCut !== null) {
      const initialParent = parent, initialParentId = parentId;
      const population = (id: string, name: string, region: 'Q1' | 'Q3', color: string) => {
        const gate: Gate = {
          id, name, parentId: initialParentId, color, type: 'quadrant',
          xParam: cd3.name, yParam: cd19.name, xTransform: 'arcsinh', yTransform: 'arcsinh',
          quadrantCenter: { x: tCut, y: bCut }, quadrantRegion: region, isAutoGate: true,
        };
        const result = CytometryMath.evaluateGate(file, gate, initialParent);
        gates.push(gate); populations.push(result.stats);
        return result.indices;
      };
      const t = population('auto_tcells', 'CD3+ / CD19− (sugerido)', 'Q3', '#2563eb');
      const b = population('auto_bcells', 'CD19+ / CD3− (sugerido)', 'Q1', '#e11d48');
      tCount = t.length; bCount = b.length;
      if (igg) {
        if (t.length) tIggMedian = quantile(values(file, igg, t), .5);
        if (b.length) bIggMedian = quantile(values(file, igg, b), .5);
      } else warnings.push('Sin canal IgG identificable: no se calcularon medianas.');
    } else warnings.push('CD3/CD19 sin umbrales separables mediante Otsu.');
  } else warnings.push('Sin CD3/CD19 o con pocos eventos: clasificación T/B no disponible.');

  if (!file.metadata.spillover) warnings.push('Sin $SPILLOVER: verificar compensación.');
  return { gates, populations, warnings, tCount, bCount, tIggMedian, bIggMedian };
}
