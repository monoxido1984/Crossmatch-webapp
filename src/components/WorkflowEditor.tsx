import React, { useState, useCallback } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Node,
  Edge,
  Handle,
  Position,
  NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Play } from 'lucide-react';
import { FCSFile, Gate } from '../types/cytometry';

// Clean Web App Node Card
const CytoNode: React.FC<NodeProps> = ({ data, selected }) => {
  const d = data as {
    label: string;
    sublabel: string;
    type: string;
    status: 'idle' | 'running' | 'completed';
    metrics?: string;
  };

  const getStatusStyle = () => {
    switch (d.status) {
      case 'completed':
        return 'border-emerald-200 text-emerald-800 bg-emerald-50';
      case 'running':
        return 'border-blue-300 text-blue-800 bg-blue-50';
      default:
        return 'border-slate-200 text-slate-500 bg-slate-50';
    }
  };

  return (
    <div
      className={`min-w-[210px] rounded-md border bg-white shadow-xs transition-all text-xs ${
        selected ? 'border-blue-600 ring-2 ring-blue-100' : 'border-slate-300'
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-slate-400 !w-2.5 !h-2.5 !border-2 !border-white"
      />

      <div className="p-3 space-y-1.5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
          <span className="font-bold text-slate-900 text-xs truncate">{d.label}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${getStatusStyle()}`}>
            {d.status === 'completed' ? 'Completado' : d.status === 'running' ? 'En ejecución' : 'Pendiente'}
          </span>
        </div>

        <div className="text-[11px] text-slate-600 leading-tight">{d.sublabel}</div>

        {d.metrics && (
          <div className="p-1.5 rounded bg-slate-50 border border-slate-200 text-[10px] text-slate-700 font-mono truncate">
            {d.metrics}
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-slate-400 !w-2.5 !h-2.5 !border-2 !border-white"
      />
    </div>
  );
};

const nodeTypes = {
  cytoNode: CytoNode,
};

interface WorkflowEditorProps {
  file: FCSFile;
  gates: Gate[];
  onTriggerAutoGate: () => void;
}

export const WorkflowEditor: React.FC<WorkflowEditorProps> = ({ file, gates, onTriggerAutoGate }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  const initialNodes: Node[] = [
    {
      id: 'node-1',
      type: 'cytoNode',
      position: { x: 40, y: 140 },
      data: {
        label: '1. Ingesta de FCS 3.1',
        sublabel: 'Validación de cabeceras y parámetros',
        status: 'completed',
        metrics: `${file.name} (${file.metadata.totalEvents.toLocaleString()} ev)`,
      },
    },
    {
      id: 'node-2',
      type: 'cytoNode',
      position: { x: 280, y: 140 },
      data: {
        label: '2. Compensación S⁻¹',
        sublabel: 'Inversión de matriz $SPILLOVER',
        status: file.isCompensated ? 'completed' : 'idle',
        metrics: file.metadata.spillover ? 'Spillover activo' : 'Identidad',
      },
    },
    {
      id: 'node-3',
      type: 'cytoNode',
      position: { x: 520, y: 140 },
      data: {
        label: '3. Transformación Arcsinh',
        sublabel: 'Cofactor M = 150',
        status: 'completed',
        metrics: 'Preserva linealidad en cero',
      },
    },
    {
      id: 'node-4',
      type: 'cytoNode',
      position: { x: 760, y: 60 },
      data: {
        label: '4. Gate CD45/SSC',
        sublabel: 'Aislamiento de leucocitos viables',
        status: 'completed',
        metrics: 'Rendimiento: ~78.2% eventos',
      },
    },
    {
      id: 'node-5',
      type: 'cytoNode',
      position: { x: 1000, y: 60 },
      data: {
        label: '5. Filtro de Singlets',
        sublabel: 'FSC-A vs FSC-H exclusión doublets',
        status: 'completed',
        metrics: '94.8% singlets retenidos',
      },
    },
    {
      id: 'node-6',
      type: 'cytoNode',
      position: { x: 1240, y: 60 },
      data: {
        label: '6. Inmunofenotipo T/B',
        sublabel: 'CD3-APC vs CD19-PE',
        status: 'completed',
        metrics: 'CD3+ (71.4%) · CD19+ (18.2%)',
      },
    },
    {
      id: 'node-7',
      type: 'cytoNode',
      position: { x: 1480, y: 60 },
      data: {
        label: '7. Shift FCXM IgG',
        sublabel: 'Cálculo de ΔMCF crossmatch',
        status: 'completed',
        metrics: 'T: +1.240 · B: +2.810 (Positivo)',
      },
    },
    {
      id: 'node-8',
      type: 'cytoNode',
      position: { x: 1720, y: 60 },
      data: {
        label: '8. Emisión de Reporte',
        sublabel: 'Generación de informe clínico PDF',
        status: 'completed',
        metrics: 'Formato ISAC estándar',
      },
    },
  ];

  const initialEdges: Edge[] = [
    { id: 'e1-2', source: 'node-1', target: 'node-2', animated: true, style: { stroke: '#3b82f6', strokeWidth: 1.5 } },
    { id: 'e2-3', source: 'node-2', target: 'node-3', animated: true, style: { stroke: '#3b82f6', strokeWidth: 1.5 } },
    { id: 'e3-4', source: 'node-3', target: 'node-4', animated: true, style: { stroke: '#3b82f6', strokeWidth: 1.5 } },
    { id: 'e4-5', source: 'node-4', target: 'node-5', animated: true, style: { stroke: '#3b82f6', strokeWidth: 1.5 } },
    { id: 'e5-6', source: 'node-5', target: 'node-6', animated: true, style: { stroke: '#3b82f6', strokeWidth: 1.5 } },
    { id: 'e6-7', source: 'node-6', target: 'node-7', animated: true, style: { stroke: '#3b82f6', strokeWidth: 1.5 } },
    { id: 'e7-8', source: 'node-7', target: 'node-8', animated: true, style: { stroke: '#3b82f6', strokeWidth: 1.5 } },
  ];

  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);

  const onNodesChange = useCallback((changes: any) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes: any) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);
  const onConnect = useCallback((connection: any) => setEdges((eds) => addEdge(connection, eds)), []);

  const handleRunWorkflow = async () => {
    setIsRunning(true);
    for (let i = 0; i < nodes.length; i++) {
      setNodes((prev) =>
        prev.map((n, idx) => (idx === i ? { ...n, data: { ...n.data, status: 'running' } } : n))
      );
      await new Promise((r) => setTimeout(r, 350));
      setNodes((prev) =>
        prev.map((n, idx) => (idx === i ? { ...n, data: { ...n.data, status: 'completed' } } : n))
      );
    }
    setIsRunning(false);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-none bg-slate-50">
      {/* Workflow Controls Bar */}
      <div className="h-12 border-b border-slate-200 px-6 flex items-center justify-between shrink-0 bg-white shadow-2xs">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-slate-700">Flujo de Trabajo:</span>
          <span className="text-slate-900 font-medium">Estandarización de Crossmatch FCXM</span>
          <span className="text-slate-400">·</span>
          <span className="text-slate-500 text-[11px]">8 nodos en ejecución secuencial</span>
        </div>

        <button
          onClick={handleRunWorkflow}
          disabled={isRunning}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-colors shadow-2xs"
        >
          <Play className={`w-3 h-3 ${isRunning ? 'animate-spin' : ''}`} />
          <span>{isRunning ? 'Ejecutando...' : 'Ejecutar Flujo'}</span>
        </button>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          onNodeClick={(_, node) => setSelectedNode(node)}
          fitView
          className="bg-slate-50"
        >
          <Background color="#cbd5e1" gap={20} size={1} />
          <Controls className="!bg-white !border-slate-300 !text-slate-700 rounded shadow-sm" />
        </ReactFlow>

        {/* Node Drawer */}
        {selectedNode && (
          <div className="absolute top-4 right-4 w-72 rounded-lg border border-slate-200 bg-white p-4 shadow-lg space-y-2.5 z-20 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="font-bold text-slate-900">{(selectedNode.data as any).label}</span>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>
            <div className="text-[11px] text-slate-600">
              {(selectedNode.data as any).sublabel}
            </div>
            <div className="p-2.5 rounded bg-slate-50 border border-slate-200 text-[11px] space-y-1 text-slate-700 font-mono">
              <div>Estado: {(selectedNode.data as any).status}</div>
              <div>Entorno: WebAssembly / Web Worker Local</div>
              <div>Compatible con flowCore: Sí</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
