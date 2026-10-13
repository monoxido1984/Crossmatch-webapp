import React from 'react';
import { FileText, Layers, GitBranch, Cpu, Upload, ShieldCheck, Check } from 'lucide-react';

interface TopNavbarProps {
  activeTab: 'explorer' | 'batch' | 'workflow' | 'diagnostics';
  setActiveTab: (tab: 'explorer' | 'batch' | 'workflow' | 'diagnostics') => void;
  sampleName: string;
  totalEvents: number;
  onOpenSampleManager: () => void;
  onOpenReportModal: () => void;
  onRunWebRPoC: () => void;
  isCompensated: boolean;
  onToggleCompensation: () => void;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({
  activeTab,
  setActiveTab,
  sampleName,
  totalEvents,
  onOpenSampleManager,
  onOpenReportModal,
  onRunWebRPoC,
  isCompensated,
  onToggleCompensation,
}) => {
  return (
    <header className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-6 select-none shrink-0 z-30 shadow-xs">
      {/* Zone 1: LIS / Web App Branding */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-blue-700 text-white flex items-center justify-center font-bold text-xs">
            CF
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900 tracking-tight leading-none">
              CYTOFLOW
            </div>
            <div className="text-[10px] text-slate-500 font-medium leading-tight mt-0.5">
              Sistema de Citometría · LIS
            </div>
          </div>
        </div>
      </div>

      {/* Zone 2: Navigation Links (Clean Web App Tabs) */}
      <nav className="flex items-center gap-1">
        <button
          onClick={() => setActiveTab('explorer')}
          className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            activeTab === 'explorer'
              ? 'bg-slate-100 text-blue-700 font-semibold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Layers className="w-3.5 h-3.5 text-slate-500" />
          <span>Explorador de Gating</span>
        </button>

        <button
          onClick={() => setActiveTab('batch')}
          className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${activeTab === 'batch' ? 'bg-slate-100 text-blue-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Analizar lote FCS</span>
        </button>

      </nav>

      {/* Zone 3: Enterprise Actions & Sample Selector */}
      <div className="flex items-center gap-3 shrink-0 text-xs">
        {/* Sample Info & Selector Button */}
        <button
          onClick={onOpenSampleManager}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors"
          title="Cambiar muestra o cargar archivo FCS"
        >
          <Upload className="w-3.5 h-3.5 text-slate-500" />
          <span className="font-medium max-w-[150px] truncate">{sampleName}</span>
          <span className="text-slate-400 font-mono text-[11px]">({totalEvents.toLocaleString()} ev)</span>
        </button>

        {/* Spillover Compensation Toggle */}
        <button
          onClick={onToggleCompensation}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-xs font-medium transition-colors ${
            isCompensated
              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
          title="Activar o desactivar matriz de compensación S^-1"
        >
          {isCompensated && <Check className="w-3 h-3 text-emerald-600" />}
          <span>Compensación {isCompensated ? 'S⁻¹ Activa' : 'Desactivada'}</span>
        </button>

        {/* Primary Action Button: Standard Enterprise Button */}
        <button
          onClick={onOpenReportModal}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors"
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Emitir Reporte</span>
        </button>
      </div>
    </header>
  );
};
