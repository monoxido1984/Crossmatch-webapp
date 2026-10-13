import { CytometryMath } from './cytometryMath';
import type { FCSFile, FCSParameter, Gate, PopulationStats } from '../types/cytometry';

export type Step = 'singlets' | 'lymph' | 'cd45' | 'phenotype' | 'iggT' | 'iggB';
export const STEPS: { id: Step; label: string; hint: string }[] = [
  { id: 'singlets', label: '1. Singletes', hint: 'FSC-A × FSC-H: excluir dobles' },
  { id: 'lymph', label: '2. Linfocitos', hint: 'FSC-A × SSC-A: seleccionar la nube linfocitaria' },
  { id: 'cd45', label: '3. CD45+', hint: 'CD45 × SSC-A: delimitar CD45 positivo' },
  { id: 'phenotype', label: '4. CD3 / CD19', hint: 'Cuadrantes: T = CD3+/CD19−; B = CD19+/CD3−' },
  { id: 'iggT', label: '5. IgG en T', hint: 'Histograma IgG-FITC de linfocitos T' },
  { id: 'iggB', label: '6. IgG en B', hint: 'Histograma IgG-FITC de linfocitos B' },
];

const markers = {
  fscA: /^FSC[-_ ]?A$/i, fscH: /^FSC[-_ ]?H$/i, sscA: /^SSC[-_ ]?A$/i,
  cd45: /CD45(?!\d)/i, cd3: /CD3(?!\d)/i, cd19: /CD19(?!\d)/i,
  igg: /(?:IGG|ANTI[-_ ]?HUMAN[-_ ]?IG)/i,
};

export function roles(file: FCSFile) {
  const find = (pattern: RegExp) => file.parameters.find(p =>
    pattern.test(p.name) || pattern.test(p.stain) || pattern.test(p.shortName));
  // Names in instrument files may differ; ambiguous matches must be reviewed.
  return {
    fscA: find(markers.fscA), fscH: find(markers.fscH), sscA: find(markers.sscA),
    cd45: find(markers.cd45), cd3: find(markers.cd3), cd19: find(markers.cd19),
    igg: find(markers.igg),
  };
}

export function axisForStep(file: FCSFile, step: Step): [FCSParameter | undefined, FCSParameter | undefined] {
  const p = roles(file);
  switch (step) {
    case 'singlets': return [p.fscA, p.fscH];
    case 'lymph': return [p.fscA, p.sscA];
    case 'cd45': return [p.cd45, p.sscA];
    case 'phenotype': return [p.cd3, p.cd19];
    default: return [p.igg, undefined];
  }
}

export function gateIdForStep(step: Step): string {
  return ({ singlets: 'cx_singlets', lymph: 'cx_lymph', cd45: 'cx_cd45', phenotype: 'cx_t',
    iggT: 'cx_t', iggB: 'cx_b' })[step];
}

export interface Computed {
  indices: Map<string, Uint32Array>;
  stats: Map<string, PopulationStats>;
  warnings: string[];
  intensities: { T: { count: number; mean: number | null; median: number | null };
    B: { count: number; mean: number | null; median: number | null } };
}

export function computeWorkflow(file: FCSFile, gates: Gate[]): Computed {
  const indices = new Map<string, Uint32Array>();
  const stats = new Map<string, PopulationStats>();
  const warnings: string[] = [];
  const n = file.metadata.totalEvents;
  indices.set('root', Uint32Array.from({ length: n }, (_, i) => i));
  let remaining = [...gates];
  while (remaining.length) {
    const idx = remaining.findIndex(g => indices.has(g.parentId || 'root'));
    if (idx < 0) { warnings.push('Jerarquía de gates incompleta o circular.'); break; }
    const gate = remaining.splice(idx, 1)[0];
    const parent = indices.get(gate.parentId || 'root')!;
    const missing = [gate.xParam, gate.yParam].filter(key =>
      !file.parameters.some(p => [p.name, p.stain, p.shortName].includes(key)));
    if (missing.length) {
      indices.set(gate.id, new Uint32Array(0));
      warnings.push(gate.name + ': faltan canales ' + missing.join(', '));
      continue;
    }
    const result = CytometryMath.evaluateGate(file, gate, parent);
    indices.set(gate.id, result.indices);
    stats.set(gate.id, result.stats);
  }
  const igg = roles(file).igg;
  const events = file.isCompensated && file.compensatedEvents ? file.compensatedEvents : file.events;
  const summary = (key: string) => {
    const subset = indices.get(key) || new Uint32Array(0);
    if (!igg || subset.length === 0) return { count: subset.length, mean: null, median: null };
    let sum = 0;
    const values = new Float64Array(subset.length);
    for (let i = 0; i < subset.length; i++) {
      const value = events[subset[i] * file.parameters.length + igg.index];
      values[i] = value; sum += value;
    }
    values.sort();
    const mid = Math.floor(values.length / 2);
    return {
      count: subset.length, mean: sum / subset.length,
      median: values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2,
    };
  };
  if (!igg) warnings.push('No se identificó un canal IgG en el FCS; revisá $PnS/$PnN.');
  return { indices, stats, warnings, intensities: { T: summary('cx_t'), B: summary('cx_b') } };
}

export function makeGate(file: FCSFile, step: Step, shape:
  | { type: 'rectangle'; bounds: { minX: number; maxX: number; minY: number; maxY: number } }
  | { type: 'polygon'; points: { x: number; y: number }[] }
  | { type: 'quadrants'; center: { x: number; y: number } }): Gate[] {
  const [x, y] = axisForStep(file, step);
  if (!x || !y) return [];
  const config: Record<string, { parent: string | null; name: string; color: string }> = {
    singlets: { parent: null, name: 'Singletes', color: '#0f766e' },
    lymph: { parent: 'cx_singlets', name: 'Linfocitos', color: '#2563eb' },
    cd45: { parent: 'cx_lymph', name: 'CD45+', color: '#7c3aed' },
  };
  if (step === 'phenotype' && shape.type === 'quadrants') {
    return ([
      ['cx_t', 'Linfocitos T · CD3+/CD19−', 'Q3', '#2563eb'],
      ['cx_b', 'Linfocitos B · CD19+/CD3−', 'Q1', '#e11d48'],
    ] as const).map(([id, name, region, color]) => ({
      id, name, color, parentId: 'cx_cd45', type: 'quadrant', xParam: x.name, yParam: y.name,
      xTransform: 'arcsinh', yTransform: 'arcsinh', quadrantCenter: shape.center,
      quadrantRegion: region,
    }));
  }
  if (!(step in config) || shape.type === 'quadrants') return [];
  const spec = config[step];
  return [{
    id: gateIdForStep(step), name: spec.name, color: spec.color, parentId: spec.parent,
    xParam: x.name, yParam: y.name, xTransform: 'arcsinh', yTransform: 'arcsinh',
    ...(shape.type === 'rectangle' ? { type: 'rectangle' as const, rectangleBounds: shape.bounds } :
      { type: 'polygon' as const, polygonPoints: shape.points }),
  }];
}

/** Geometric starting suggestions only; adjust every gate against the actual FCS. */
export function suggestWorkflow(file: FCSFile): Gate[] {
  const p = roles(file);
  if (!p.fscA || !p.fscH || !p.sscA || !p.cd45 || !p.cd3 || !p.cd19) return [];
  const events = file.isCompensated && file.compensatedEvents ? file.compensatedEvents : file.events;
  const stride = file.parameters.length;
  const value = (i: number, col: FCSParameter) => events[i * stride + col.index];
  const sampled: number[] = [];
  const step = Math.max(1, Math.ceil(file.metadata.totalEvents / 15000));
  for (let i = 0; i < file.metadata.totalEvents; i += step) sampled.push(i);
  const percentile = (column: FCSParameter, q: number, ids = sampled) => {
    const arr = ids.map(i => value(i, column)).filter(Number.isFinite).sort((a, b) => a - b);
    return arr[Math.floor(q * Math.max(0, arr.length - 1))] ?? 0;
  };
  const r = sampled.map(i => {
    const f = value(i, p.fscA!);
    return f > 0 ? value(i, p.fscH!) / f : NaN;
  }).filter(Number.isFinite).sort((a, b) => a - b);
  const ratio = r[Math.floor(r.length / 2)] || 1;
  const fLow = percentile(p.fscA, .02), fHigh = percentile(p.fscA, .98);
  let result = makeGate(file, 'singlets', { type: 'polygon', points: [
    { x: fLow, y: fLow * ratio * .82 }, { x: fHigh, y: fHigh * ratio * .82 },
    { x: fHigh, y: fHigh * ratio * 1.18 }, { x: fLow, y: fLow * ratio * 1.18 },
  ] });
  result.push(...makeGate(file, 'lymph', { type: 'rectangle', bounds: {
    minX: percentile(p.fscA, .07), maxX: percentile(p.fscA, .93),
    minY: percentile(p.sscA, .03), maxY: percentile(p.sscA, .77),
  } }));
  const cd45Cut = percentile(p.cd45, .23);
  result.push(...makeGate(file, 'cd45', { type: 'rectangle', bounds: {
    minX: cd45Cut, maxX: percentile(p.cd45, .998),
    minY: percentile(p.sscA, .001), maxY: percentile(p.sscA, .998),
  } }));
  result.push(...makeGate(file, 'phenotype', { type: 'quadrants', center: {
    x: percentile(p.cd3, .53), y: percentile(p.cd19, .62),
  } }));
  return result;
}
