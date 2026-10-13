import { FCSParser } from '../services/fcsParser';
import { CytometryMath } from '../services/cytometryMath';
import { CrossmatchDatasetService } from '../services/crossmatchDataset';
import { analyzeFCS } from '../services/autoAnalysis';
import type { FCSFile, Gate } from '../types/cytometry';

type Request = {
  id: string;
  name: string;
  buffer?: ArrayBuffer;
  demo?: boolean;
  demoPositive?: boolean;
  mode: 'inspect' | 'batch';
  workflow?: Gate[];
  auto?: boolean;
  compensate?: boolean;
};

type GateResult = { id: string; name: string; count: number; percentOfParent: number; medianX: number; medianY: number };
type BatchResponse = {
  id: string;
  name: string;
  events: number;
  channels: number;
  compensated: boolean;
  gates: GateResult[];
  warnings: string[];
  error?: string;
};

function evaluate(file: FCSFile, workflow: Gate[], warnings: string[]): GateResult[] {
  const indexMap = new Map<string, Uint32Array>();
  indexMap.set('root', Uint32Array.from({ length: file.metadata.totalEvents }, (_, i) => i));
  const results: GateResult[] = [];
  const remaining = [...workflow];
  const processed = new Set<string>();
  while (remaining.length) {
    const index = remaining.findIndex(g => g.parentId === null || processed.has(g.parentId));
    if (index < 0) {
      warnings.push('Jerarquía de gates inválida: referencias circulares o padres inexistentes.');
      break;
    }
    const gate = remaining.splice(index, 1)[0];
    const parentIndices = indexMap.get(gate.parentId ?? 'root')!;
    const hasX = file.parameters.some(p => [p.name, p.shortName, p.stain].includes(gate.xParam));
    const hasY = file.parameters.some(p => [p.name, p.shortName, p.stain].includes(gate.yParam));
    if (!hasX || !hasY) {
      warnings.push('Gate ' + gate.name + ': canales ausentes (' + gate.xParam + ' / ' + gate.yParam + ')');
      indexMap.set(gate.id, new Uint32Array(0));
      results.push({ id: gate.id, name: gate.name, count: 0, percentOfParent: 0, medianX: 0, medianY: 0 });
    } else {
      const { indices, stats } = CytometryMath.evaluateGate(file, gate, parentIndices);
      indexMap.set(gate.id, indices);
      results.push({ id: gate.id, name: gate.name, count: stats.count, percentOfParent: stats.percentOfParent,
        medianX: stats.medianX, medianY: stats.medianY });
    }
    processed.add(gate.id);
  }
  return results;
}

self.onmessage = (event: MessageEvent<Request>) => {
  const message = event.data;
  try {
    const parsed = message.demo
      ? CrossmatchDatasetService.createSample(message.name, message.demoPositive ?? true, 15000)
      : FCSParser.parse(message.buffer!, message.name);
    let file = parsed;
    const warnings: string[] = [];
    if (message.compensate) {
      if (file.metadata.spillover) {
        try {
          const compensatedEvents = CytometryMath.applyCompensation(file);
          file = { ...file, isCompensated: true, compensatedEvents };
        } catch (error) {
          warnings.push('Compensación omitida: ' + String(error));
        }
      } else {
        warnings.push('No hay $SPILLOVER; se analizaron datos sin compensar.');
      }
    }
    if (message.mode === 'inspect') {
      // Move typed-array ownership to the main thread rather than copying event matrices.
      const transfers: Transferable[] = [file.events.buffer];
      if (file.compensatedEvents) transfers.push(file.compensatedEvents.buffer);
      if (file.rawBuffer) transfers.push(file.rawBuffer);
      self.postMessage({ id: message.id, type: 'inspect', file }, transfers);
      return;
    }
    const analysis = message.auto ? analyzeFCS(file) : undefined;
    const workflow = analysis ? analysis.gates : (message.workflow ?? []);
    if (workflow.length === 0) warnings.push('Ningún gate definido: solo se informa el total de eventos.');
    const gates = evaluate(file, workflow, warnings);
    const result: BatchResponse = { id: message.id, name: message.name, events: file.metadata.totalEvents,
      channels: file.parameters.length, compensated: file.isCompensated, gates,
      warnings: [...warnings, ...(analysis?.warnings ?? [])] };
    self.postMessage({ id: message.id, type: 'batch', result, analysis });
  } catch (error) {
    self.postMessage({ id: message.id, type: 'error', error: error instanceof Error ? error.message : String(error) });
  }
};
