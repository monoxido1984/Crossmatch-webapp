/**
 * Data structures and types for CYTOFLOW Flow Cytometry Platform
 */

export type TransformType = 'linear' | 'log10' | 'arcsinh' | 'logicle';

export interface FCSParameter {
  index: number;
  name: string; // e.g. "$P1N" -> "FSC-A"
  stain: string; // e.g. "$P1S" -> "CD3 APC"
  shortName: string; // Clean display label e.g. "CD3" or "FSC-A"
  range: number; // e.g. 262144
  bits: number; // e.g. 32
  min: number;
  max: number;
}

export interface SpilloverMatrix {
  parameters: string[]; // Names of fluorophore channels
  matrix: number[][]; // N x N spillover coefficients
}

export interface FCSMetadata {
  version: 'FCS2.0' | 'FCS3.0' | 'FCS3.1' | 'Unknown';
  totalEvents: number;
  parameterCount: number;
  byteOrder: 'little' | 'big';
  cytometer?: string;
  date?: string;
  operator?: string;
  spillover?: SpilloverMatrix;
  rawTextMap: Record<string, string>;
}

export interface FCSFile {
  id: string;
  name: string;
  size: number;
  uploadDate: string;
  metadata: FCSMetadata;
  parameters: FCSParameter[];
  rawBuffer?: ArrayBuffer;
  events: Float32Array; // Flattened row-major matrix: totalEvents x parameterCount
  compensatedEvents?: Float32Array;
  isCompensated: boolean;
  panelType: 'FCXM Crossmatch' | 'Lymphocyte Phenotyping' | 'Custom';
}

export type GateType = 'polygon' | 'rectangle' | 'quadrant' | 'threshold';

export interface Point2D {
  x: number;
  y: number;
}

export interface Gate {
  id: string;
  name: string;
  color: string;
  parentId: string | null; // null represents "All Events" root
  type: GateType;
  xParam: string; // Parameter name e.g. "FSC-A" or "CD45"
  yParam: string; // Parameter name e.g. "SSC-A" or "CD3"
  xTransform: TransformType;
  yTransform: TransformType;
  // Specific geometric coordinates in data space (not screen pixels)
  polygonPoints?: Point2D[];
  rectangleBounds?: { minX: number; maxX: number; minY: number; maxY: number };
  quadrantCenter?: Point2D;
  quadrantRegion?: 'Q1' | 'Q2' | 'Q3' | 'Q4'; // Q1: +-, Q2: ++, Q3: -+, Q4: --
  thresholdRange?: { min: number; max: number };
  isAutoGate?: boolean;
  algorithm?: 'manual' | 'density-peak' | 'fsc-ssc-ellipse' | 'singlet-ratio' | 'otsu-fluorescence';
}

export interface PopulationStats {
  gateId: string;
  gateName: string;
  parentId: string | null;
  count: number;
  percentOfParent: number;
  percentOfTotal: number;
  meanX: number;
  medianX: number;
  cvX: number; // Coefficient of Variation %
  meanY: number;
  medianY: number;
  cvY: number;
  // Crossmatch specific metrics
  channelShift?: number; // Delta MCF relative to negative control
}

export interface PopulationNode {
  gate: Gate;
  stats: PopulationStats;
  children: PopulationNode[];
  indices: Uint32Array; // Event row indices belonging to this population
}

export interface WorkflowNodeData {
  label: string;
  type: 'import' | 'qc' | 'compensate' | 'transform' | 'cell_gate' | 'singlet_gate' | 'phenotype' | 'statistics' | 'report';
  status: 'idle' | 'running' | 'completed' | 'error';
  params: Record<string, any>;
  summary?: string;
}

export interface WebRDiagnosticLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  details?: string;
}
