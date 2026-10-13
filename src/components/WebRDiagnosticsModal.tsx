import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Copy,
  Cpu,
  Play,
  RotateCw,
  X,
} from 'lucide-react';
import { FCSFile, Gate } from '../types/cytometry';
import { WebREngineService, WebRPoCResult } from '../services/webrEngine';

interface WebRDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: FCSFile;
  gates: Gate[];
}

export const WebRDiagnosticsModal: React.FC<WebRDiagnosticsModalProps> = ({
  isOpen,
  onClose,
  file,
  gates,
}) => {
  const [activeTab, setActiveTab] = useState<'poc' | 'terminal' | 'rscript'>('poc');
  const [steps, setSteps] = useState<WebRPoCResult[]>([]);
  const [isRunningPoC, setIsRunningPoC] = useState(false);
  const [blockerReport, setBlockerReport] = useState<string | null>(null);

  const [rInput, setRInput] = useState<string>('R.version.string');
  const [terminalHistory, setTerminalHistory] = useState<{ command: string; result: string }[]>([
    {
      command: 'R.version.string',
      result: 'R version 4.4.1 (2024-06-14) -- "Race for Your Life" (WebAssembly Emscripten)',
    },
  ]);
  const [isExecutingR, setIsExecutingR] = useState(false);

  const webrService = WebREngineService.getInstance();

  const handleRunPoC = async () => {
    setIsRunningPoC(true);
    setBlockerReport(null);
    const result = await webrService.runScientificPoC(file, (updatedSteps) => {
      setSteps(updatedSteps);
    });
    setIsRunningPoC(false);
    if (result.blockerReport) {
      setBlockerReport(result.blockerReport);
    }
  };

  const handleExecuteRCommand = async () => {
    if (!rInput.trim()) return;
    setIsExecutingR(true);
    const cmd = rInput;
    setRInput('');
    const output = await webrService.executeRCode(cmd);
    setTerminalHistory((prev) => [...prev, { command: cmd, result: output }]);
    setIsExecutingR(false);
  };

  const reproducibleScript = WebREngineService.generateReproducibleRScript(file, gates);

  const handleCopyScript = () => {
    navigator.clipboard.writeText(reproducibleScript);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 select-none">
      <div className="w-full max-w-4xl bg-white border border-slate-300 rounded-lg shadow-xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Modal Top Bar */}
        <div className="h-13 px-6 border-b border-slate-200 flex items-center justify-between shrink-0 bg-slate-50">
          <div className="flex items-center gap-2 text-xs">
            <Cpu className="w-4 h-4 text-slate-600" />
            <span className="font-bold text-slate-900 text-sm">
              Auditoría y Validación WebR / flowCore
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex p-0.5 rounded border border-slate-200 bg-white text-xs">
              <button
                onClick={() => setActiveTab('poc')}
                className={`px-3 py-1 rounded font-medium transition-colors ${
                  activeTab === 'poc'
                    ? 'bg-blue-50 text-blue-800'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                PoC de 7 Pasos
              </button>
              <button
                onClick={() => setActiveTab('terminal')}
                className={`px-3 py-1 rounded font-medium transition-colors ${
                  activeTab === 'terminal'
                    ? 'bg-blue-50 text-blue-800'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Consola R en Vivo
              </button>
              <button
                onClick={() => setActiveTab('rscript')}
                className={`px-3 py-1 rounded font-medium transition-colors ${
                  activeTab === 'rscript'
                    ? 'bg-blue-50 text-blue-800'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Script .R Reproducible
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1 rounded text-slate-400 hover:text-slate-700 ml-2 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          {/* TAB 1: 7-Step PoC */}
          {activeTab === 'poc' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-900 text-sm">
                    Evaluación de flowCore en Entorno WebAssembly
                  </div>
                  <div className="text-xs text-slate-600 mt-0.5">
                    Evalúa la inicialización de WebR, paquetes de Bioconductor y dependencias nativas de C++ (cytolib).
                  </div>
                </div>

                <button
                  onClick={handleRunPoC}
                  disabled={isRunningPoC}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs transition-colors"
                >
                  <Play className={`w-3.5 h-3.5 ${isRunningPoC ? 'animate-spin' : ''}`} />
                  <span>{isRunningPoC ? 'Evaluando...' : 'Ejecutar Validación'}</span>
                </button>
              </div>

              {/* Steps List */}
              <div className="space-y-2">
                {steps.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 text-xs">
                    Haga clic en "Ejecutar Validación" para iniciar la secuencia de comprobación de WebR.
                  </div>
                ) : (
                  steps.map((s) => (
                    <div
                      key={s.step}
                      className={`p-3 rounded border flex items-start gap-3 transition-colors ${
                        s.status === 'success'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                          : s.status === 'blocked'
                          ? 'border-amber-200 bg-amber-50 text-amber-900'
                          : s.status === 'running'
                          ? 'border-blue-200 bg-blue-50 text-blue-900'
                          : s.status === 'failed'
                          ? 'border-rose-200 bg-rose-50 text-rose-900'
                          : 'border-slate-200 bg-slate-50 text-slate-600'
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">
                        {s.status === 'success' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        ) : s.status === 'blocked' ? (
                          <AlertCircle className="w-4 h-4 text-amber-600" />
                        ) : s.status === 'running' ? (
                          <RotateCw className="w-4 h-4 text-blue-600 animate-spin" />
                        ) : (
                          <Clock className="w-4 h-4 text-slate-400" />
                        )}
                      </div>

                      <div className="flex-1 space-y-0.5">
                        <div className="flex items-center justify-between font-bold text-xs">
                          <span>
                            Paso {s.step}: {s.stepName}
                          </span>
                          {s.durationMs !== undefined && (
                            <span className="font-mono text-slate-500 tabular-nums">{s.durationMs}ms</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-700 leading-tight">{s.message}</div>
                        {s.error && (
                          <div className="p-2 rounded bg-white border border-current/20 font-mono text-[11px] text-slate-800 break-all mt-1">
                            {s.error}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Blocker Report Section */}
              {blockerReport && (
                <div className="p-4 rounded-lg border border-amber-300 bg-amber-50/70 text-slate-800 space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider text-amber-900">
                    <AlertCircle className="w-4 h-4 text-amber-700" />
                    <span>Auditoría de Ejecución Científica y Diagnóstico</span>
                  </div>
                  <div className="text-xs leading-relaxed whitespace-pre-line text-slate-700">
                    {blockerReport}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Interactive R Terminal */}
          {activeTab === 'terminal' && (
            <div className="space-y-3">
              <div className="bg-slate-900 text-slate-100 rounded-lg border border-slate-700 p-4 font-mono text-xs space-y-2 min-h-[300px] max-h-[380px] overflow-y-auto">
                <div className="text-slate-400">
                  # Sesión Interactiva R con WebR (Motor WebAssembly en Navegador)
                  <br />
                  # Ingrese expresiones en R para evaluar (ej: search(), sessionInfo(), rnorm(5))
                </div>

                {terminalHistory.map((h, i) => (
                  <div key={i} className="space-y-0.5 border-b border-slate-800 pb-2">
                    <div className="text-blue-400 font-semibold">{'> ' + h.command}</div>
                    <div className="text-slate-200 whitespace-pre-wrap">{h.result}</div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={rInput}
                  onChange={(e) => setRInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleExecuteRCommand()}
                  placeholder="ej. rnorm(5), sessionInfo(), search()"
                  className="flex-1 bg-white border border-slate-300 rounded px-3 py-2 text-xs font-mono text-slate-800 outline-none focus:border-blue-500"
                />
                <button
                  onClick={handleExecuteRCommand}
                  disabled={isExecutingR}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-medium rounded text-xs transition-colors"
                >
                  {isExecutingR ? 'Evaluando...' : 'Ejecutar'}
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: Reproducible flowCore .R Script */}
          {activeTab === 'rscript' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-slate-600">
                <span>Código R reproducible para Bioconductor flowCore:</span>
                <button
                  onClick={handleCopyScript}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded shadow-2xs font-medium transition-colors"
                >
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  <span>Copiar Script</span>
                </button>
              </div>

              <pre className="p-4 bg-slate-900 text-blue-200 border border-slate-700 rounded-lg font-mono text-xs overflow-x-auto max-h-[360px] leading-relaxed">
                {reproducibleScript}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
