import React, { useRef, useState } from 'react';
import type { FCSFile } from '../types/cytometry';
import { FCSParser } from '../services/fcsParser';
import { CytometryMath } from '../services/cytometryMath';
import { analyzeFCS, type AutomaticAnalysis } from '../services/autoAnalysis';
import { CrossmatchDatasetService } from '../services/crossmatchDataset';

export interface BatchResult {
  id: string;
  filename: string;
  status: 'ok' | 'error';
  events: number;
  channels: number;
  compensated: boolean;
  analysis?: AutomaticAnalysis;
  error?: string;
}

interface Props {
  onInspect: (file: FCSFile, analysis: AutomaticAnalysis) => void;
}

function csvCell(value: string | number | undefined): string {
  return '"' + String(value ?? '').replace(/"/g, '""') + '"';
}

export const BatchAnalysis: React.FC<Props> = ({ onInspect }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<BatchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [useCompensation, setUseCompensation] = useState(true);
  const [savedFiles, setSavedFiles] = useState<Map<string, FCSFile>>(new Map());

  const analyzeOne = (file: FCSFile): { result: BatchResult; sample: FCSFile } => {
    let sample = file;
    if (useCompensation && file.metadata.spillover) {
      const compensatedEvents = CytometryMath.applyCompensation(file);
      sample = { ...file, compensatedEvents, isCompensated: true };
    }
    const analysis = analyzeFCS(sample);
    return { sample, result: {
      id: file.id, filename: file.name, status: 'ok',
      events: file.metadata.totalEvents, channels: file.parameters.length,
      compensated: sample.isCompensated, analysis,
    } };
  };

  const run = async (demo = false) => {
    if (busy) return;
    setBusy(true); setItems([]); setProgress('');
    const nextFiles = new Map<string, FCSFile>();
    const results: BatchResult[] = [];
    const count = demo ? 3 : files.length;
    for (let i = 0; i < count; i++) {
      const filename = demo ? ['Demo_FCXM_positivo.fcs', 'Demo_Control_negativo.fcs', 'Demo_FCXM_replicado.fcs'][i] : files[i].name;
      setProgress(`Procesando ${i + 1}/${count}: ${filename}`);
      // Allow browser to repaint and keep progress visible.
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      try {
        const sample = demo
          ? CrossmatchDatasetService.createSample(filename, i !== 1, 12000)
          : FCSParser.parse(await files[i].arrayBuffer(), filename);
        const analyzed = analyzeOne(sample);
        results.push(analyzed.result);
        // Retain only the most recently analyzed sample for inspection, avoiding batch-sized RAM growth.
        nextFiles.clear();
        nextFiles.set(sample.id, analyzed.sample);
      } catch (error) {
        results.push({
          id: `error_${i}`, filename, status: 'error', events: 0, channels: 0,
          compensated: false, error: error instanceof Error ? error.message : String(error),
        });
      }
      setItems([...results]);
    }
    setSavedFiles(nextFiles);
    setProgress(`Finalizado: ${results.filter(r => r.status === 'ok').length}/${count} procesados`);
    setBusy(false);
  };

  const inspect = async (result: BatchResult) => {
    if (!result.analysis || result.status !== 'ok') return;
    // For real files re-read from the File to avoid retaining every event matrix in RAM.
    let sample = savedFiles.get(result.id);
    if (!sample) {
      const original = files.find(f => f.name === result.filename);
      if (!original) return;
      try {
        sample = FCSParser.parse(await original.arrayBuffer(), original.name);
        if (result.compensated && sample.metadata.spillover) {
          sample = { ...sample, isCompensated: true, compensatedEvents: CytometryMath.applyCompensation(sample) };
        }
      } catch (err) {
        setProgress(`No se pudo abrir ${result.filename}: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
    }
    onInspect(sample, result.analysis);
  };

  const exportCSV = () => {
    const headers = ['archivo', 'estado', 'eventos', 'canales', 'compensado', 'T_n', 'B_n', 'T_IgG_mediana', 'B_IgG_mediana', 'advertencias', 'error'];
    const rows = items.map(r => [
      r.filename, r.status, r.events, r.channels, r.compensated ? 'sí' : 'no',
      r.analysis?.tCount, r.analysis?.bCount, r.analysis?.tIggMedian, r.analysis?.bIggMedian,
      r.analysis?.warnings.join(' | '), r.error,
    ].map(v => csvCell(v)).join(','));
    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'cytoflow_lote_exploratorio.csv'; anchor.click();
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
                <td className="p-3 font-medium">{r.filename}<div className="text-slate-500">{r.error || r.analysis?.warnings.slice(1).join(' · ')}</div></td>
                <td className="p-3">{r.status === 'ok' ? 'Procesado' : 'Error'}</td>
                <td className="p-3">{r.events.toLocaleString()}</td>
                <td className="p-3">{r.analysis?.tCount ?? '—'}</td>
                <td className="p-3">{r.analysis?.bCount ?? '—'}</td>
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
