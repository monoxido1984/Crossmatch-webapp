import React, { useRef, useState } from 'react';
import type { FCSFile, Gate } from '../types/cytometry';
import { analyzeFCS, type AutomaticAnalysis } from '../services/autoAnalysis';

export interface BatchResult {
  id: string;
  filename: string;
  status: 'ok' | 'error';
  events: number;
  channels: number;
  compensated: boolean;
  analysis?: AutomaticAnalysis;
  gateSummaries?: { id: string; name: string; count: number; percentOfParent: number; medianX: number; medianY: number }[];
  warnings?: string[];
  error?: string;
}

interface Props {
  onInspect: (file: FCSFile, analysis: AutomaticAnalysis) => void;
  template: Gate[];
}

function csvCell(value: string | number | undefined): string {
  return '"' + String(value ?? '').replace(/"/g, '""') + '"';
}

export const BatchAnalysis: React.FC<Props> = ({ onInspect, template }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<BatchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [useCompensation, setUseCompensation] = useState(true);
  const [useTemplate, setUseTemplate] = useState(false);
  const [loadedTemplate, setLoadedTemplate] = useState<Gate[] | null>(null);
  const activeTemplate = loadedTemplate ?? template;


  const run = async (demo = false) => {
    if (busy) return;
    setBusy(true); setItems([]); setProgress('');
    const results: BatchResult[] = [];
    const inputs = demo
      ? ['Demo_FCXM_positivo.fcs', 'Demo_Control_negativo.fcs', 'Demo_FCXM_replicado.fcs'].map((name, i) => ({ name, demo: true, demoPositive: i !== 1 }))
      : files.map(file => ({ name: file.name, file }));
    // All CPU-heavy parsing and analysis happens in a worker, not on the UI thread.
    const worker = new Worker(new URL('../workers/fcsWorker.ts', import.meta.url), { type: 'module' });
    try {
      for (let i = 0; i < inputs.length; i++) {
        const entry = inputs[i];
        setProgress('Procesando ' + (i + 1) + '/' + inputs.length + ': ' + entry.name);
        try {
          const id = 'batch_' + i;
          const buffer = 'file' in entry && entry.file ? await entry.file.arrayBuffer() : undefined;
          const response = await new Promise<any>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Tiempo máximo excedido procesando FCS')), 120000);
            worker.onmessage = e => {
              if (e.data.id !== id) return;
              clearTimeout(timeout);
              resolve(e.data);
            };
            worker.onerror = e => {
              clearTimeout(timeout);
              reject(new Error(e.message || 'Error del motor FCS'));
            };
            worker.postMessage({
              id, name: entry.name, mode: 'batch', demo: 'demo' in entry ? entry.demo : false,
              demoPositive: 'demoPositive' in entry ? entry.demoPositive : true,
              buffer, auto: !useTemplate, workflow: useTemplate ? activeTemplate : undefined,
              compensate: useCompensation,
            }, buffer ? [buffer] : []);
          });
          if (response.type === 'error') throw new Error(response.error);
          results.push({
            id, filename: entry.name, status: 'ok', events: response.result.events,
            channels: response.result.channels, compensated: response.result.compensated,
            analysis: response.analysis,
            gateSummaries: response.result.gates,
            warnings: response.result.warnings,
          });
        } catch (error) {
          results.push({
            id: 'error_' + i, filename: entry.name, status: 'error', events: 0,
            channels: 0, compensated: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        setItems([...results]);
      }
      setProgress('Finalizado: ' + results.filter(r => r.status === 'ok').length + '/' + inputs.length + ' archivos.');
    } finally {
      worker.terminate();
      setBusy(false);
    }
  };

  const inspect = async (result: BatchResult) => {
    if (result.status !== 'ok') return;
    setProgress('Abriendo ' + result.filename + '...');
    const worker = new Worker(new URL('../workers/fcsWorker.ts', import.meta.url), { type: 'module' });
    try {
      const original = files.find(f => f.name === result.filename);
      const isDemo = result.filename.startsWith('Demo_');
      const buffer = !isDemo && original ? await original.arrayBuffer() : undefined;
      if (!isDemo && !buffer) throw new Error('No se encuentra el archivo original.');
      const response = await new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Tiempo de apertura excedido')), 120000);
        worker.onmessage = event => {
          clearTimeout(timeout);
          resolve(event.data);
        };
        worker.onerror = event => { clearTimeout(timeout); reject(new Error(event.message)); };
        worker.postMessage({
          id: 'inspect', name: result.filename, mode: 'inspect', buffer,
          demo: isDemo, demoPositive: !result.filename.includes('negativo'),
          compensate: result.compensated,
        }, buffer ? [buffer] : []);
      });
      if (response.type !== 'inspect') throw new Error(response.error || 'Error abriendo FCS.');
      const sample = response.file as FCSFile;
      onInspect(sample, useTemplate ? {
        gates: activeTemplate, populations: [], warnings: result.warnings || [],
      } : result.analysis || analyzeFCS(sample));
      setProgress('');
    } catch (error) {
      setProgress('Error al abrir: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      worker.terminate();
    }
  };

  const exportCSV = () => {
    const header = ['archivo', 'estado', 'eventos_totales', 'compensado',
      'gate', 'eventos_gate', 'porcentaje_padre', 'mediana_x', 'mediana_y', 'advertencias', 'error'];
    const rows = items.flatMap(item => {
      const gates = item.gateSummaries?.length ? item.gateSummaries : [undefined];
      return gates.map(gate => [
        item.filename, item.status, item.events, item.compensated ? 'si' : 'no',
        gate?.name, gate?.count, gate?.percentOfParent, gate?.medianX, gate?.medianY,
        item.warnings?.join(' | '), item.error,
      ].map(v => csvCell(v)).join(','));
    });
    const csv = '\uFEFF' + [header.join(','), ...rows].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'cytoflow_resultados_lote.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section className="flex-1 overflow-y-auto bg-slate-50 p-6 text-slate-800">
      <div className="mx-auto max-w-6xl space-y-5">
        <div>
          <h1 className="text-xl font-bold">Análisis automático de archivos FCS</h1>
          <p className="mt-1 text-sm text-slate-600">Procesamiento local, secuencial y exploratorio. Los archivos nunca se envían al servidor.</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
          <div onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); setFiles(Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.fcs'))); }}
            className="border-2 border-dashed border-blue-200 rounded-lg p-5 bg-blue-50/50">
            <input ref={inputRef} type="file" accept=".fcs" multiple className="block w-full text-sm" onChange={e => setFiles(Array.from(e.target.files || []))} />
            <p className="text-xs text-slate-500 mt-2">Seleccioná varios .fcs o arrastralos aquí. Archivos seleccionados: {files.length}</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={useCompensation} onChange={e => setUseCompensation(e.target.checked)} />
            Aplicar compensación cuando exista $SPILLOVER válido
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={useTemplate} onChange={e => setUseTemplate(e.target.checked)} disabled={activeTemplate.length === 0} />
            Usar gates del explorador como workflow ({activeTemplate.length} gates)
          </label>
          <div className="flex items-center flex-wrap gap-3 text-xs text-slate-600">
            <label className="cursor-pointer rounded border border-slate-300 bg-white p-2">
              Importar workflow JSON
              <input type="file" accept=".json" className="sr-only" onChange={async e => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const gates = JSON.parse(await file.text());
                  if (!Array.isArray(gates) || gates.length === 0 || gates.length > 250 ||
                      !gates.every((g: any) => typeof g.id === 'string' &&
                        typeof g.xParam === 'string' && typeof g.yParam === 'string' &&
                        typeof g.type === 'string' && (g.parentId === null || typeof g.parentId === 'string'))) {
                    throw new Error('Formato inválido. Se esperaba una lista de gates.');
                  }
                  setLoadedTemplate(gates as Gate[]);
                  setUseTemplate(true);
                  setProgress('Workflow cargado: ' + gates.length + ' gates');
                } catch (error) {
                  setProgress('No se pudo importar workflow: ' + String(error));
                }
                e.target.value = '';
              }} />
            </label>
            <button disabled={activeTemplate.length === 0}
              className="rounded border border-slate-300 bg-white p-2 disabled:opacity-50"
              onClick={() => {
                const url = URL.createObjectURL(new Blob([JSON.stringify(activeTemplate, null, 2)], { type: 'application/json' }));
                const link = document.createElement('a');
                link.href = url; link.download = 'workflow_gating.json'; link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}>
              Guardar workflow JSON
            </button>
            <span>Se reutilizan las mismas coordenadas de gates sobre los canales de cada muestra. Revisar variaciones instrumentales.</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="rounded bg-blue-600 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50" disabled={busy || files.length === 0} onClick={() => void run()}>Analizar lote ({files.length})</button>
            <button className="rounded border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50" disabled={busy} onClick={() => void run(true)}>Probar con 3 FCS simulados</button>
            <button className="rounded border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50" disabled={busy || items.length === 0} onClick={exportCSV}>Exportar CSV del lote</button>
          </div>
          {progress && <div role="status" className="text-sm text-blue-700">{progress}</div>}
        </div>
        {items.length > 0 && (
          <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 text-slate-600"><tr>{['Muestra', 'Estado', 'Eventos', 'T (n)', 'B (n)', 'Mediana IgG T', 'Mediana IgG B', 'Acción'].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead>
              <tbody>{items.map(r => <tr key={r.id} className="border-t border-slate-100">
                <td className="p-3 font-medium">{r.filename}<div className="text-slate-500">{r.error || r.warnings?.slice(1).join(' · ')}</div></td>
                <td className="p-3">{r.status === 'ok' ? 'Procesado' : 'Error'}</td>
                <td className="p-3">{r.events.toLocaleString()}</td>
                <td className="p-3">{r.gateSummaries?.find(g => g.id === 'auto_tcells')?.count ?? '—'}</td>
                <td className="p-3">{r.gateSummaries?.find(g => g.id === 'auto_bcells')?.count ?? '—'}</td>
                <td className="p-3">{r.analysis?.tIggMedian?.toFixed(1) ?? '—'}</td>
                <td className="p-3">{r.analysis?.bIggMedian?.toFixed(1) ?? '—'}</td>
                <td className="p-3"><button disabled={r.status !== 'ok' || busy} className="text-blue-700 underline disabled:opacity-30" onClick={() => void inspect(r)}>Inspeccionar gates</button></td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-amber-800">Este prototipo no calcula positividad de crossmatch ni DSA. Las poblaciones se delimitan mediante heurísticas (percentiles y Otsu), no mediante un gating validado. Revisar todo resultado con controles y personal capacitado.</p>
      </div>
    </section>
  );
};
