import React from 'react';
import { SlidersHorizontal, Trash2, FileSpreadsheet, CheckCircle, AlertTriangle } from 'lucide-react';
import { FCSFile, Gate, PopulationStats } from '../types/cytometry';

interface GateInspectorPanelProps {
  file: FCSFile;
  activeGate: Gate | null;
  stats: PopulationStats | null;
  onDeleteGate: (gateId: string) => void;
  isCompensated: boolean;
  onToggleCompensation: () => void;
  onExportCSV: () => void;
}

export const GateInspectorPanel: React.FC<GateInspectorPanelProps> = ({
  file,
  activeGate,
  stats,
  onDeleteGate,
  isCompensated,
  onToggleCompensation,
  onExportCSV,
}) => {
  const spillover = file.metadata.spillover;

  const isCrossmatchPanel = file.panelType === 'FCXM Crossmatch';
  const hasIggParam =
    activeGate &&
    (activeGate.xParam.toUpperCase().includes('IGG') ||
      activeGate.xParam.toUpperCase().includes('FITC') ||
      activeGate.name.toUpperCase().includes('IGG'));

  const mcf = stats?.medianX ?? 0;
  const negativeControlMcf = 400;
  const channelShift = hasIggParam ? mcf - negativeControlMcf : null;

  let crossmatchVerdict: 'negative' | 'borderline' | 'positive' | null = null;
  if (channelShift !== null) {
    if (channelShift < 250) crossmatchVerdict = 'negative';
    else if (channelShift < 500) crossmatchVerdict = 'borderline';
    else crossmatchVerdict = 'positive';
  }

  return (
    <aside className="w-80 bg-white border-l border-slate-200 flex flex-col h-full select-none shrink-0 overflow-y-auto">
      {/* Header */}
      <div className="px-3.5 py-2.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/60">
        <div className="flex items-center gap-1.5">
          <SlidersHorizontal className="w-3.5 h-3.5 text-slate-600" />
          <span className="text-xs font-semibold text-slate-800">
            Inspector de Gate y Estadísticas
          </span>
        </div>
        {activeGate && (
          <span
            className="w-2.5 h-2.5 rounded-xs border border-slate-300"
            style={{ backgroundColor: activeGate.color }}
          />
        )}
      </div>

      <div className="p-3.5 space-y-4 text-xs">
        {/* Active Population Identification */}
        <div className="space-y-1">
          <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
            Población Seleccionada
          </div>
          <div className="p-2.5 rounded border border-slate-200 bg-slate-50/80 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-900">
                {activeGate ? activeGate.name : 'Todos los Eventos'}
              </span>
              <span className="text-[11px] text-slate-500 font-mono">
                {activeGate ? activeGate.type : 'raíz'}
              </span>
            </div>
            {activeGate && (
              <div className="text-[11px] text-slate-600">
                Canales: <span className="font-medium text-slate-800">{activeGate.xParam}</span> vs{' '}
                <span className="font-medium text-slate-800">{activeGate.yParam}</span>
              </div>
            )}
          </div>
        </div>

        {/* Counts & Percentages */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
            Rendimiento y Frecuencia
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 rounded border border-slate-200 bg-white shadow-2xs">
              <div className="text-[10px] text-slate-500 font-medium">RECUENTO (N)</div>
              <div className="text-base font-bold font-mono text-slate-900 tabular-nums mt-0.5">
                {(stats?.count ?? file.metadata.totalEvents).toLocaleString()}
              </div>
            </div>
            <div className="p-2.5 rounded border border-slate-200 bg-white shadow-2xs">
              <div className="text-[10px] text-slate-500 font-medium">% DEL PADRE</div>
              <div className="text-base font-bold font-mono text-blue-700 tabular-nums mt-0.5">
                {(stats?.percentOfParent ?? 100).toFixed(1)}%
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between px-2.5 py-1.5 rounded border border-slate-200 bg-slate-50 text-[11px]">
            <span className="text-slate-600">% de la Muestra Total:</span>
            <span className="font-semibold font-mono text-slate-900 tabular-nums">
              {(stats?.percentOfTotal ?? 100).toFixed(2)}%
            </span>
          </div>
        </div>

        {/* Fluorescence Parameters Grid */}
        {stats && activeGate && (
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
              Parámetros de Fluorescencia (MFI)
            </div>
            <div className="rounded border border-slate-200 overflow-hidden text-xs">
              <div className="grid grid-cols-3 px-2.5 py-1.5 bg-slate-100/80 border-b border-slate-200 font-semibold text-[10px] text-slate-700">
                <span>ESTADÍSTICA</span>
                <span className="text-right truncate">{activeGate.xParam}</span>
                <span className="text-right truncate">{activeGate.yParam}</span>
              </div>
              <div className="divide-y divide-slate-100 font-mono text-[11px] tabular-nums">
                <div className="grid grid-cols-3 px-2.5 py-1.5 text-slate-700">
                  <span className="text-slate-500 font-sans">Media</span>
                  <span className="text-right">{Math.round(stats.meanX).toLocaleString()}</span>
                  <span className="text-right">{Math.round(stats.meanY).toLocaleString()}</span>
                </div>
                <div className="grid grid-cols-3 px-2.5 py-1.5 text-slate-900 font-semibold bg-slate-50/60">
                  <span className="text-slate-600 font-sans">Mediana</span>
                  <span className="text-right text-blue-700">{Math.round(stats.medianX).toLocaleString()}</span>
                  <span className="text-right text-blue-700">{Math.round(stats.medianY).toLocaleString()}</span>
                </div>
                <div className="grid grid-cols-3 px-2.5 py-1.5 text-slate-700">
                  <span className="text-slate-500 font-sans">CV (%)</span>
                  <span className="text-right">{stats.cvX.toFixed(1)}%</span>
                  <span className="text-right">{stats.cvY.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* FCXM Crossmatch Clinical Card */}
        {isCrossmatchPanel && channelShift !== null && (
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
              Evaluación de Crossmatch (FCXM)
            </div>
            <div
              className={`p-3 rounded border text-xs space-y-2 ${
                crossmatchVerdict === 'positive'
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : crossmatchVerdict === 'borderline'
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-900'
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold">
                {crossmatchVerdict === 'positive' ? (
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                ) : (
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                )}
                <span>
                  {crossmatchVerdict === 'positive'
                    ? 'CROSSMATCH POSITIVO (DSA DETECTADO)'
                    : crossmatchVerdict === 'borderline'
                    ? 'CROSSMATCH LIMÍTROFE'
                    : 'CROSSMATCH NEGATIVO (COMPATIBLE)'}
                </span>
              </div>

              <div className="space-y-1 font-mono text-[11px] tabular-nums pt-1 border-t border-current/20">
                <div className="flex justify-between">
                  <span>Mediana de Muestra (MCF):</span>
                  <span className="font-semibold">{Math.round(mcf).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Control Negativo (MCF):</span>
                  <span>{negativeControlMcf}</span>
                </div>
                <div className="flex justify-between font-bold pt-0.5">
                  <span>Desplazamiento (ΔMCF):</span>
                  <span>+{Math.round(channelShift).toLocaleString()}</span>
                </div>
              </div>

              <p className="text-[11px] font-sans leading-relaxed text-slate-700 pt-1">
                {crossmatchVerdict === 'positive'
                  ? 'Presencia significativa de anticuerpos IgG específicos contra células del donante.'
                  : 'Sin desplazamiento significativo respecto al suero basal de referencia.'}
              </p>
            </div>
          </div>
        )}

        {/* Spillover Info */}
        {spillover && (
          <div className="space-y-1">
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
              Compensación de Fluorescencia ($SPILL)
            </div>
            <div className="p-2.5 rounded border border-slate-200 bg-slate-50 text-[11px] space-y-1 text-slate-700">
              <div>Canales compensados: {spillover.parameters.join(', ')}</div>
              <div className="text-slate-500">
                Estado: {isCompensated ? 'Matriz S⁻¹ aplicada a todos los eventos' : 'Desactivada'}
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="pt-2 space-y-2 border-t border-slate-200">
          <button
            onClick={onExportCSV}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium transition-colors shadow-2xs"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-slate-500" />
            <span>Exportar Estadísticas a CSV</span>
          </button>

          {activeGate && (
            <button
              onClick={() => onDeleteGate(activeGate.id)}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-medium transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Eliminar este Gate</span>
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
