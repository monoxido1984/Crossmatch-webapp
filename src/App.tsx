import React, { useState, useEffect, useMemo } from 'react';
import { TopNavbar } from './components/TopNavbar';
import { GatingHierarchyTree } from './components/GatingHierarchyTree';
import { BivariatePlotStage } from './components/BivariatePlotStage';
import { GateInspectorPanel } from './components/GateInspectorPanel';
import { WorkflowEditor } from './components/WorkflowEditor';
import { WebRDiagnosticsModal } from './components/WebRDiagnosticsModal';
import { ReportModal } from './components/ReportModal';
import { SampleManagerModal } from './components/SampleManagerModal';
import { FCSFile, Gate, PopulationStats } from './types/cytometry';
import { CrossmatchDatasetService } from './services/crossmatchDataset';
import { CytometryMath } from './services/cytometryMath';
import { StorageService } from './services/storage';
import { BatchAnalysis } from './components/BatchAnalysis';

export default function App() {
  const [currentFile, setCurrentFile] = useState<FCSFile>(() => {
    return CrossmatchDatasetService.createSample('Donor01_PatientSerum_FCXM.fcs', true, 45000);
  });

  const [gates, setGates] = useState<Gate[]>(() => {
    const saved = null; // Do not restore gates from a different sample without checking file identity.
    const defaults = CrossmatchDatasetService.getDefaultCrossmatchGates();
    const sampleParams = new Set(['FSC-A', 'FSC-H', 'SSC-A', 'IgG FITC', 'CD19 PE', 'CD45 PerCP', 'CD3 APC']);
    const valid = saved && saved.length > 0 && saved.every((g) =>
      sampleParams.has(g.xParam) && sampleParams.has(g.yParam) &&
      (g.parentId === null || saved.some((parent) => parent.id === g.parentId))
    );
    return valid ? saved! : defaults;
  });

  const [activeGateId, setActiveGateId] = useState<string | null>('gate_cd3_tcells');
  const [activeTab, setActiveTab] = useState<'explorer' | 'batch' | 'workflow' | 'diagnostics'>('explorer');

  const [selectedXParam, setSelectedXParam] = useState<string>('CD3 APC');
  const [selectedYParam, setSelectedYParam] = useState<string>('CD19 PE');

  const [isSampleManagerOpen, setIsSampleManagerOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isWebRPoCOpen, setIsWebRPoCOpen] = useState(false);

  const isCompensated = currentFile.isCompensated;
  const [processingError, setProcessingError] = useState<string | null>(null);

  const handleToggleCompensation = () => {
    setProcessingError(null);
    if (currentFile.isCompensated) {
      setCurrentFile((prev) => ({ ...prev, isCompensated: false, compensatedEvents: undefined }));
      return;
    }
    if (!currentFile.metadata.spillover) {
      setProcessingError('El archivo no contiene una matriz $SPILLOVER / $SPILL. No se aplicó compensación.');
      return;
    }
    try {
      const compensatedEvents = CytometryMath.applyCompensation(currentFile);
      setCurrentFile((prev) => ({ ...prev, compensatedEvents, isCompensated: true }));
    } catch (error) {
      setProcessingError(error instanceof Error ? error.message : String(error));
    }
  };

  const { statsMap, indicesMap } = useMemo(() => {
    const sMap = new Map<string, PopulationStats>();
    const iMap = new Map<string, Uint32Array>();

    const totalEvents = currentFile.metadata.totalEvents;
    const allIndices = new Uint32Array(totalEvents);
    for (let i = 0; i < totalEvents; i++) {
      allIndices[i] = i;
    }
    iMap.set('root', allIndices);

    const processedGates = new Set<string>();
    let remaining = [...gates];

    while (remaining.length > 0) {
      let madeProgress = false;
      const nextRemaining: Gate[] = [];

      for (const gate of remaining) {
        const parentId = gate.parentId;
        if (parentId === null || processedGates.has(parentId)) {
          const parentIndices = parentId === null ? allIndices : iMap.get(parentId) || new Uint32Array(0);
          const evalResult = CytometryMath.evaluateGate(currentFile, gate, parentIndices);
          sMap.set(gate.id, evalResult.stats);
          iMap.set(gate.id, evalResult.indices);
          processedGates.add(gate.id);
          madeProgress = true;
        } else {
          nextRemaining.push(gate);
        }
      }

      if (!madeProgress) break;
      remaining = nextRemaining;
    }

    return { statsMap: sMap, indicesMap: iMap };
  }, [currentFile, gates]);

  useEffect(() => {
    StorageService.saveGates(gates);
  }, [gates]);

  useEffect(() => {
    if (activeGateId) {
      const g = gates.find((gate) => gate.id === activeGateId);
      if (g) {
        setSelectedXParam(g.xParam);
        setSelectedYParam(g.yParam);
      }
    }
  }, [activeGateId, gates]);

  const handleAddGate = (newGate: Gate) => {
    setGates((prev) => [...prev, newGate]);
    setActiveGateId(newGate.id);
  };

  const handleDeleteGate = (gateId: string) => {
    const idsToDelete = new Set<string>([gateId]);
    let added = true;
    while (added) {
      added = false;
      for (const g of gates) {
        if (g.parentId && idsToDelete.has(g.parentId) && !idsToDelete.has(g.id)) {
          idsToDelete.add(g.id);
          added = true;
        }
      }
    }

    setGates((prev) => prev.filter((g) => !idsToDelete.has(g.id)));
    if (activeGateId && idsToDelete.has(activeGateId)) {
      setActiveGateId(null);
    }
  };

  const handleAutoGateFSC_SSC = () => {
    if (!currentFile.parameters.some((p) => /FSC-A/i.test(p.name)) ||
        !currentFile.parameters.some((p) => /SSC-A/i.test(p.name))) {
      setProcessingError('Para este gate necesitás canales FSC-A y SSC-A.');
      return;
    }
    const rootIndices = indicesMap.get('root') || new Uint32Array(0);
    const autoGate = CytometryMath.autoGateFSC_SSC(currentFile, rootIndices);
    setGates((prev) => [...prev, autoGate]);
    setActiveGateId(autoGate.id);
  };

  const handleAutoGateSinglets = () => {
    if (!currentFile.parameters.some((p) => /FSC-A/i.test(p.name)) ||
        !currentFile.parameters.some((p) => /FSC-H/i.test(p.name))) {
      setProcessingError('Para este gate necesitás canales FSC-A y FSC-H.');
      return;
    }
    const parentId = activeGateId;
    const autoGate = CytometryMath.autoGateSinglets(currentFile, parentId);
    setGates((prev) => [...prev, autoGate]);
    setActiveGateId(autoGate.id);
  };

  const handleExportCSV = () => {
    let csv = 'Gate_ID,Poblacion,Parent_ID,Eventos,Porcentaje_Padre,Porcentaje_Total,Media_X,Mediana_X,CV_X,Media_Y,Mediana_Y,CV_Y\n';
    gates.forEach((gate) => {
      const s = statsMap.get(gate.id);
      if (s) {
        csv += `"${gate.id}","${gate.name}","${gate.parentId || 'Raiz'}",${s.count},${s.percentOfParent.toFixed(2)},${s.percentOfTotal.toFixed(2)},${s.meanX.toFixed(1)},${s.medianX.toFixed(1)},${s.cvX.toFixed(2)},${s.meanY.toFixed(1)},${s.medianY.toFixed(1)},${s.cvY.toFixed(2)}\n`;
      }
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `estadisticas_citometria_${currentFile.name.replace('.fcs', '')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const parentIndicesForPlot = useMemo(() => {
    if (!activeGateId) {
      return indicesMap.get('root') || new Uint32Array(0);
    }
    const currentGate = gates.find((g) => g.id === activeGateId);
    if (!currentGate || !currentGate.parentId) {
      return indicesMap.get('root') || new Uint32Array(0);
    }
    return indicesMap.get(currentGate.parentId) || new Uint32Array(0);
  }, [activeGateId, gates, indicesMap]);

  const activeGate = useMemo(() => {
    return gates.find((g) => g.id === activeGateId) || null;
  }, [activeGateId, gates]);

  const activeStats = useMemo(() => {
    return activeGateId ? statsMap.get(activeGateId) || null : null;
  }, [activeGateId, statsMap]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-100 text-slate-900 font-sans">
      <TopNavbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        sampleName={currentFile.name}
        totalEvents={currentFile.metadata.totalEvents}
        onOpenSampleManager={() => setIsSampleManagerOpen(true)}
        onOpenReportModal={() => setIsReportModalOpen(true)}
        onRunWebRPoC={() => setIsWebRPoCOpen(true)}
        isCompensated={isCompensated}
        onToggleCompensation={handleToggleCompensation}
      />

      {processingError && (
        <div role="alert" className="px-4 py-2 text-xs text-rose-800 bg-rose-50 border-b border-rose-200 flex items-center justify-between">
          <span>{processingError}</span>
          <button onClick={() => setProcessingError(null)} aria-label="Cerrar error" className="font-bold px-2">×</button>
        </div>
      )}
      <main className="flex-1 flex overflow-hidden relative">
        {activeTab === 'explorer' && (
          <div className="flex-1 flex h-full w-full overflow-hidden">
            <GatingHierarchyTree
              gates={gates}
              statsMap={statsMap}
              totalEvents={currentFile.metadata.totalEvents}
              activeGateId={activeGateId}
              onSelectGate={(id) => setActiveGateId(id)}
              onDeleteGate={handleDeleteGate}
              onAutoGateFSC_SSC={handleAutoGateFSC_SSC}
              onAutoGateSinglets={handleAutoGateSinglets}
            />

            <BivariatePlotStage
              file={currentFile}
              activeGateId={activeGateId}
              gates={gates}
              parentIndices={parentIndicesForPlot}
              onAddGate={handleAddGate}
              selectedXParam={selectedXParam}
              selectedYParam={selectedYParam}
              onSelectXParam={(param) => setSelectedXParam(param)}
              onSelectYParam={(param) => setSelectedYParam(param)}
            />

            <GateInspectorPanel
              file={currentFile}
              activeGate={activeGate}
              stats={activeStats}
              onDeleteGate={handleDeleteGate}
              isCompensated={isCompensated}
              onToggleCompensation={handleToggleCompensation}
              onExportCSV={handleExportCSV}
            />
          </div>
        )}

        {activeTab === 'batch' && (
          <BatchAnalysis template={gates} onInspect={(sample, analysis) => {
            setCurrentFile(sample);
            setGates(analysis.gates);
            setActiveGateId(null);
            setSelectedXParam(sample.parameters[0]?.shortName || sample.parameters[0]?.name || '');
            setSelectedYParam(sample.parameters[1]?.shortName || sample.parameters[0]?.name || '');
            setProcessingError(null);
            setActiveTab('explorer');
          }} />
        )}

        {activeTab === 'workflow' && (
          <WorkflowEditor
            file={currentFile}
            gates={gates}
            onTriggerAutoGate={handleAutoGateFSC_SSC}
          />
        )}

        {activeTab === 'diagnostics' && (
          <div className="flex-1 p-6 overflow-y-auto bg-slate-50 text-slate-900">
            <div className="max-w-4xl mx-auto space-y-5">
              <div className="pb-4 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h1 className="text-lg font-bold text-slate-900">
                    Motor Científico Bioconductor flowCore & Auditoría WebR
                  </h1>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Verificación de entorno WebAssembly local y validación con scripts R reproducibles
                  </p>
                </div>
                <button
                  onClick={() => setIsWebRPoCOpen(true)}
                  className="px-3.5 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs transition-colors"
                >
                  Abrir Consola de Auditoría
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg border border-slate-200 bg-white shadow-2xs space-y-1.5">
                  <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Arquitectura de Ejecución Local
                  </div>
                  <div className="text-sm font-semibold text-slate-900">
                    Procesamiento de Alta Eficiencia
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    CYTOFLOW ejecuta el análisis matemáticamente riguroso dentro del navegador del usuario (cálculo
                    estricto de compensación por inversión Gauss-Jordan, transformaciones Arcsinh/Logicle y cálculo de
                    MFI sobre el 100% de eventos), garantizando privacidad de datos sin requerir servidores de pago.
                  </p>
                </div>

                <div className="p-4 rounded-lg border border-slate-200 bg-white shadow-2xs space-y-1.5">
                  <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Panel Clínico en Uso
                  </div>
                  <div className="text-sm font-semibold text-slate-900">
                    Crossmatch por Citometría (FCXM)
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Muestra de PBMC de donante marcada con CD45-PerCP, CD3-APC, CD19-PE y suero del paciente con
                    IgG-FITC. Permite aislar linfocitos T y B y calcular el desplazamiento de canal (ΔMCF) frente al suero
                    control negativo.
                  </p>
                </div>
              </div>

              {/* R Script Preview Card */}
              <div className="p-4 rounded-lg border border-slate-200 bg-white shadow-2xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-900 text-xs">
                    Script R Reproducible para Bioconductor flowCore:
                  </span>
                  <button
                    onClick={() => setIsWebRPoCOpen(true)}
                    className="text-xs text-blue-600 hover:underline font-medium"
                  >
                    Ver en Consola Interactiva &rarr;
                  </button>
                </div>
                <pre className="p-3.5 rounded border border-slate-200 bg-slate-50 text-slate-800 font-mono text-xs overflow-x-auto max-h-[220px] leading-relaxed">
                  {`library(flowCore)
# Lectura estandarizada de archivo FCS
ff <- read.FCS("${currentFile.name}")
summary(ff)

# Compensacion con matriz $SPILLOVER
spill <- description(ff)$SPILLOVER
ff_comp <- compensate(ff, spill)

# Estrategia de gating para FCXM...`}
                </pre>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      <SampleManagerModal
        isOpen={isSampleManagerOpen}
        onClose={() => setIsSampleManagerOpen(false)}
        currentFile={currentFile}
        onSelectSample={(sample) => {
          setCurrentFile({ ...sample, compensatedEvents: undefined, isCompensated: false });
          const params = new Set(sample.parameters.flatMap((p) => [p.name, p.stain, p.shortName]));
          const defaults = CrossmatchDatasetService.getDefaultCrossmatchGates();
          setGates(sample.panelType === 'FCXM Crossmatch' &&
            defaults.every((gate) => params.has(gate.xParam) && params.has(gate.yParam)) ? defaults : []);
          setActiveGateId(null);
          setSelectedXParam(sample.parameters[0]?.shortName || sample.parameters[0]?.name || '');
          setSelectedYParam(sample.parameters[1]?.shortName || sample.parameters[0]?.name || '');
          setProcessingError(null);
        }}
      />

      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        file={currentFile}
        gates={gates}
        statsMap={statsMap}
      />

      <WebRDiagnosticsModal
        isOpen={isWebRPoCOpen}
        onClose={() => setIsWebRPoCOpen(false)}
        file={currentFile}
        gates={gates}
      />
    </div>
  );
}
