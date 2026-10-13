import React from 'react';
import { GitFork, Trash2, Folder, Sparkles } from 'lucide-react';
import { Gate, PopulationStats } from '../types/cytometry';

interface GatingHierarchyTreeProps {
  gates: Gate[];
  statsMap: Map<string, PopulationStats>;
  totalEvents: number;
  activeGateId: string | null;
  onSelectGate: (gateId: string | null) => void;
  onDeleteGate: (gateId: string) => void;
  onAutoGateFSC_SSC: () => void;
  onAutoGateSinglets: () => void;
}

export const GatingHierarchyTree: React.FC<GatingHierarchyTreeProps> = ({
  gates,
  statsMap,
  totalEvents,
  activeGateId,
  onSelectGate,
  onDeleteGate,
  onAutoGateFSC_SSC,
  onAutoGateSinglets,
}) => {
  const buildTree = (parentId: string | null): Gate[] => {
    return gates.filter((g) => g.parentId === parentId);
  };

  const rootGates = buildTree(null);

  const renderGateNode = (gate: Gate, depth: number = 0) => {
    const stats = statsMap.get(gate.id);
    const count = stats?.count ?? 0;
    const parentPct = stats?.percentOfParent ?? 0;
    const children = buildTree(gate.id);
    const isSelected = activeGateId === gate.id;

    return (
      <div key={gate.id} className="flex flex-col">
        <div
          onClick={() => onSelectGate(gate.id)}
          className={`group flex items-center justify-between px-3 py-1.5 cursor-pointer text-xs select-none transition-colors border-l-2 ${
            isSelected
              ? 'bg-blue-50 border-blue-600 text-blue-950 font-medium'
              : 'border-transparent text-slate-700 hover:bg-slate-50 hover:text-slate-900'
          }`}
          style={{ paddingLeft: `${Math.max(12, depth * 14 + 12)}px` }}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="w-2.5 h-2.5 rounded-xs shrink-0 border border-slate-300"
              style={{ backgroundColor: gate.color }}
            />
            <span className="truncate">{gate.name}</span>
            {gate.isAutoGate && (
              <span className="text-[10px] text-slate-400 font-normal">
                (auto)
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-2 text-right font-mono text-[11px] tabular-nums">
              <span className="text-slate-800">{count.toLocaleString()}</span>
              <span className="text-slate-500 w-12 text-right">
                {parentPct.toFixed(1)}%
              </span>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteGate(gate.id);
              }}
              className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-rose-600 transition-opacity"
              title="Eliminar Gate"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>

        {children.length > 0 && (
          <div className="flex flex-col">
            {children.map((child) => renderGateNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="w-72 bg-white border-r border-slate-200 flex flex-col h-full select-none shrink-0">
      {/* Panel Header */}
      <div className="px-3.5 py-2.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/60">
        <div className="flex items-center gap-1.5">
          <GitFork className="w-3.5 h-3.5 text-slate-600" />
          <span className="text-xs font-semibold text-slate-800">
            Jerarquía de Poblaciones
          </span>
        </div>
        <span className="text-[11px] font-mono text-slate-500 tabular-nums">
          {gates.length} gates
        </span>
      </div>

      {/* Auto-Gating Tools */}
      <div className="px-3 py-2 border-b border-slate-200 flex items-center gap-2 bg-white">
        <button
          onClick={onAutoGateFSC_SSC}
          className="flex-1 py-1 px-2 text-[11px] font-medium rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors"
          title="Auto-gating de linfocitos por FSC/SSC"
        >
          Auto FSC/SSC
        </button>

        <button
          onClick={onAutoGateSinglets}
          className="flex-1 py-1 px-2 text-[11px] font-medium rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors"
          title="Filtro automático de singlets (FSC-A vs FSC-H)"
        >
          Auto Singlets
        </button>
      </div>

      {/* Tree Content */}
      <div className="flex-1 overflow-y-auto py-1">
        {/* Root: Todos los eventos */}
        <div
          onClick={() => onSelectGate(null)}
          className={`flex items-center justify-between px-3 py-1.5 cursor-pointer text-xs select-none transition-colors border-l-2 ${
            activeGateId === null
              ? 'bg-blue-50 border-blue-600 text-blue-950 font-medium'
              : 'border-transparent text-slate-700 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-slate-400 shrink-0" />
            <span className="font-semibold">Todos los Eventos</span>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px] tabular-nums">
            <span className="text-slate-800">{totalEvents.toLocaleString()}</span>
            <span className="text-slate-500 w-12 text-right">100.0%</span>
          </div>
        </div>

        {/* Poblaciones Hijas */}
        {rootGates.map((gate) => renderGateNode(gate, 1))}
      </div>

      {/* Footer Info */}
      <div className="px-3 py-2 border-t border-slate-200 text-[11px] bg-slate-50 flex items-center justify-between text-slate-500">
        <span>Filtro activo:</span>
        <span className="font-medium text-slate-700">
          {activeGateId ? 'Subpoblación seleccionada' : 'Muestra completa'}
        </span>
      </div>
    </aside>
  );
};
