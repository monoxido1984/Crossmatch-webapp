import React, { useRef, useState } from 'react';
import { Database, Upload, X, FileSpreadsheet } from 'lucide-react';
import { FCSFile } from '../types/cytometry';
import { FCSParser } from '../services/fcsParser';
import { CrossmatchDatasetService } from '../services/crossmatchDataset';

interface SampleManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentFile: FCSFile;
  onSelectSample: (file: FCSFile) => void;
}

export const SampleManagerModal: React.FC<SampleManagerModalProps> = ({
  isOpen,
  onClose,
  currentFile,
  onSelectSample,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const buffer = event.target?.result as ArrayBuffer;
        const parsed = FCSParser.parse(buffer, file.name);
        onSelectSample(parsed);
        onClose();
      } catch (err: any) {
        setErrorMsg(`Error al procesar archivo FCS: ${err.message || String(err)}`);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleLoadPreset = (type: 'positive-fcxm' | 'negative-fcxm') => {
    if (type === 'positive-fcxm') {
      const sample = CrossmatchDatasetService.createSample(
        'Donor01_PatientSerum_FCXM.fcs',
        true,
        45000
      );
      onSelectSample(sample);
    } else if (type === 'negative-fcxm') {
      const sample = CrossmatchDatasetService.createSample(
        'Donor01_NegativeControl_FCXM.fcs',
        false,
        35000
      );
      onSelectSample(sample);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 select-none">
      <div className="w-full max-w-2xl bg-white border border-slate-300 rounded-lg shadow-xl flex flex-col overflow-hidden max-h-[85vh]">
        {/* Header */}
        <div className="h-13 px-6 border-b border-slate-200 flex items-center justify-between shrink-0 bg-slate-50">
          <div className="flex items-center gap-2 text-xs">
            <Database className="w-4 h-4 text-slate-600" />
            <span className="font-bold text-slate-900 text-sm">
              Gestor de Muestras y Archivos FCS
            </span>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto text-xs">
          {/* Drag & Drop Upload */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-lg p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors bg-slate-50 hover:bg-slate-100"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".fcs"
              className="hidden"
            />
            <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-2">
              <Upload className="w-5 h-5" />
            </div>
            <div className="font-bold text-slate-900 text-sm">
              Haga clic o arrastre un archivo FCS (.fcs)
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Compatible con FCS 2.0, 3.0 y 3.1 (BD FACSCanto II, FACSLyric, CytoFLEX, Gallios)
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded text-rose-800 text-xs">
              {errorMsg}
            </div>
          )}

          {/* Benchmark Presets */}
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              Muestras Clínicas de Demostración
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div
                onClick={() => handleLoadPreset('positive-fcxm')}
                className="p-3.5 rounded-lg border border-slate-200 bg-white hover:border-blue-500 hover:bg-blue-50/20 cursor-pointer transition-colors space-y-1 shadow-2xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">
                    Donor01_PatientSerum.fcs
                  </span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                    DSA Positivo
                  </span>
                </div>
                <div className="text-[11px] text-slate-600 leading-tight">
                  45.000 eventos. CD45, CD3, CD19, IgG crossmatch con desplazamiento marcado en T y B.
                </div>
              </div>

              <div
                onClick={() => handleLoadPreset('negative-fcxm')}
                className="p-3.5 rounded-lg border border-slate-200 bg-white hover:border-blue-500 hover:bg-blue-50/20 cursor-pointer transition-colors space-y-1 shadow-2xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">
                    Donor01_NegControl.fcs
                  </span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Control Negativo
                  </span>
                </div>
                <div className="text-[11px] text-slate-600 leading-tight">
                  35.000 eventos. Suero control negativo de referencia para cálculo basal de crossmatch.
                </div>
              </div>
            </div>
          </div>

          {/* Active File Details */}
          <div className="space-y-2 pt-2 border-t border-slate-200">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              Ficha Técnica de Muestra en Uso: {currentFile.name}
            </div>
            <div className="p-3 rounded border border-slate-200 bg-slate-50 text-xs space-y-1.5 text-slate-700">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Instrumento Citómetro:</span>
                <span className="font-semibold text-slate-900">{currentFile.metadata.cytometer || 'BD FACSCanto II'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Formato de Archivo:</span>
                <span className="font-mono text-slate-800">{currentFile.metadata.version}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Recuento Total de Eventos ($TOT):</span>
                <span className="font-mono font-semibold text-slate-900">{currentFile.metadata.totalEvents.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Canales Paramétricos ($PAR):</span>
                <span className="font-mono text-slate-800">{currentFile.parameters.length} canales</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
