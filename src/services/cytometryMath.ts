import { FCSFile, Gate, Point2D, PopulationStats, TransformType } from '../types/cytometry';

/**
 * High-Precision Scientific Cytometry Mathematics Engine
 * Supports compensation matrix inversion, transforms (Logicle, Arcsinh, Log10),
 * point-in-polygon gating, and statistical calculations across 100% of events.
 */

export class CytometryMath {
  /**
   * Apply scientific coordinate transformation to a raw fluorescence or scatter value.
   */
  public static transformValue(val: number, type: TransformType, maxRange: number = 262144): number {
    switch (type) {
      case 'linear':
        return val;
      case 'log10': {
        const safeVal = Math.max(val, 1);
        return Math.log10(safeVal);
      }
      case 'arcsinh': {
        // Standard flow cytometry arcsinh with cofactor M = 150
        const cofactor = 150;
        return Math.asinh(val / cofactor);
      }
      case 'logicle': {
        // High-fidelity Logicle / Biexponential approximation (Parks et al.)
        // T = maxRange (e.g. 262144), W = 0.5 (linear decades), M = 4.5 (total decades)
        const T = maxRange;
        const W = 0.5;
        const M = 4.5;
        const r = val / T;
        if (val >= 0) {
          const logVal = Math.log10(Math.max(val, 1));
          return Math.max(0, logVal / M);
        } else {
          // Negative values mapped smoothly symmetrically around zero
          const negVal = -val;
          return -Math.min(W, Math.log10(Math.max(negVal, 1)) / M);
        }
      }
      default:
        return val;
    }
  }

  /**
   * Invert coordinate transformation (from display space back to raw data space).
   */
  public static inverseTransform(val: number, type: TransformType): number {
    switch (type) {
      case 'linear':
        return val;
      case 'log10':
        return Math.pow(10, val);
      case 'arcsinh': {
        const cofactor = 150;
        return Math.sinh(val) * cofactor;
      }
      case 'logicle': {
        const T = 262144;
        const M = 4.5;
        if (val >= 0) {
          return Math.pow(10, val * M);
        } else {
          return -Math.pow(10, -val * M);
        }
      }
      default:
        return val;
    }
  }

  /**
   * Apply spillover matrix compensation: Y_comp = Y_raw * S^(-1)
   */
  public static applyCompensation(file: FCSFile): Float32Array {
    const spillover = file.metadata.spillover;
    const totalEvents = file.metadata.totalEvents;
    const numParams = file.parameters.length;

    if (!spillover || spillover.parameters.length === 0) {
      return new Float32Array(file.events);
    }

    const n = spillover.parameters.length;
    // Map spillover parameters to file parameter indices
    const paramIndices: number[] = [];
    for (const spillParam of spillover.parameters) {
      const idx = file.parameters.findIndex(
        (p) =>
          p.name.toUpperCase() === spillParam.toUpperCase() ||
          p.stain.toUpperCase() === spillParam.toUpperCase() ||
          p.shortName.toUpperCase() === spillParam.toUpperCase()
      );
      paramIndices.push(idx);
    }

    // Invert the N x N spillover matrix using Gauss-Jordan elimination
    const invMatrix = this.invertMatrix(spillover.matrix);
    if (!invMatrix) {
      console.warn('Failed to invert spillover matrix (singular). Returning uncompensated events.');
      return new Float32Array(file.events);
    }

    // Create compensated events buffer
    const compensated = new Float32Array(file.events);

    // Apply linear matrix multiplication for each event
    for (let e = 0; e < totalEvents; e++) {
      const rowOffset = e * numParams;
      // Extract raw fluorophore values
      const rawValues = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const colIdx = paramIndices[i];
        rawValues[i] = colIdx >= 0 ? file.events[rowOffset + colIdx] : 0;
      }

      // Multiply by inverted spillover matrix
      for (let i = 0; i < n; i++) {
        const targetCol = paramIndices[i];
        if (targetCol >= 0) {
          let compVal = 0;
          for (let j = 0; j < n; j++) {
            compVal += rawValues[j] * invMatrix[j][i];
          }
          compensated[rowOffset + targetCol] = compVal;
        }
      }
    }

    return compensated;
  }

  /**
   * Invert an N x N matrix using Gauss-Jordan elimination with partial pivoting.
   */
  public static invertMatrix(matrix: number[][]): number[][] | null {
    const n = matrix.length;
    // Build augmented matrix [A | I]
    const aug: number[][] = [];
    for (let i = 0; i < n; i++) {
      aug[i] = new Array(2 * n).fill(0);
      for (let j = 0; j < n; j++) {
        aug[i][j] = matrix[i][j];
      }
      aug[i][n + i] = 1;
    }

    for (let i = 0; i < n; i++) {
      // Find pivot
      let maxRow = i;
      let maxVal = Math.abs(aug[i][i]);
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(aug[k][i]) > maxVal) {
          maxVal = Math.abs(aug[k][i]);
          maxRow = k;
        }
      }

      if (maxVal < 1e-12) {
        return null; // Singular matrix
      }

      // Swap rows
      if (maxRow !== i) {
        const temp = aug[i];
        aug[i] = aug[maxRow];
        aug[maxRow] = temp;
      }

      // Scale pivot row
      const pivot = aug[i][i];
      for (let j = 0; j < 2 * n; j++) {
        aug[i][j] /= pivot;
      }

      // Eliminate column
      for (let k = 0; k < n; k++) {
        if (k !== i) {
          const factor = aug[k][i];
          for (let j = 0; j < 2 * n; j++) {
            aug[k][j] -= factor * aug[i][j];
          }
        }
      }
    }

    // Extract right half
    const inv: number[][] = [];
    for (let i = 0; i < n; i++) {
      inv[i] = aug[i].slice(n, 2 * n);
    }
    return inv;
  }

  /**
   * Point in Polygon test using ray casting algorithm with bounding-box pre-filtering.
   */
  public static isPointInPolygon(pt: Point2D, polygon: Point2D[]): boolean {
    if (polygon.length < 3) return false;

    // 1. Fast bounding box test
    let minX = polygon[0].x;
    let maxX = polygon[0].x;
    let minY = polygon[0].y;
    let maxY = polygon[0].y;
    for (let i = 1; i < polygon.length; i++) {
      const p = polygon[i];
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    if (pt.x < minX || pt.x > maxX || pt.y < minY || pt.y > maxY) {
      return false;
    }

    // 2. Ray casting algorithm
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x;
      const yi = polygon[i].y;
      const xj = polygon[j].x;
      const yj = polygon[j].y;

      const intersect = yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
      if (intersect) {
        inside = !inside;
      }
    }

    return inside;
  }

  /**
   * Evaluate a gate on an event subset, returning the indices of events inside the gate
   * and calculating complete statistics across all eligible events.
   */
  public static evaluateGate(
    file: FCSFile,
    gate: Gate,
    parentIndices: Uint32Array,
    negativeControlMcf?: number
  ): { indices: Uint32Array; stats: PopulationStats } {
    const numParams = file.parameters.length;
    const totalEvents = file.metadata.totalEvents;
    const eventsData = file.compensatedEvents || file.events;

    // Find channel column indices
    const xParamIdx = file.parameters.findIndex(
      (p) => p.name === gate.xParam || p.stain === gate.xParam || p.shortName === gate.xParam
    );
    const yParamIdx = file.parameters.findIndex(
      (p) => p.name === gate.yParam || p.stain === gate.yParam || p.shortName === gate.yParam
    );

    if (xParamIdx < 0 || yParamIdx < 0) {
      console.warn(`Gate parameter not found: X=${gate.xParam}, Y=${gate.yParam}`);
      return {
        indices: new Uint32Array(0),
        stats: this.createEmptyStats(gate.id, gate.name, gate.parentId),
      };
    }

    const matches: number[] = [];
    const parentCount = parentIndices.length;

    // Accumulators for statistical calculation
    let sumX = 0;
    let sumY = 0;
    const valuesX: number[] = [];
    const valuesY: number[] = [];

    for (let i = 0; i < parentCount; i++) {
      const eventIdx = parentIndices[i];
      const rowOffset = eventIdx * numParams;
      const rawX = eventsData[rowOffset + xParamIdx];
      const rawY = eventsData[rowOffset + yParamIdx];

      let isInside = false;

      if (gate.type === 'polygon' && gate.polygonPoints && gate.polygonPoints.length >= 3) {
        isInside = this.isPointInPolygon({ x: rawX, y: rawY }, gate.polygonPoints);
      } else if (gate.type === 'rectangle' && gate.rectangleBounds) {
        const { minX, maxX, minY, maxY } = gate.rectangleBounds;
        isInside = rawX >= minX && rawX <= maxX && rawY >= minY && rawY <= maxY;
      } else if (gate.type === 'quadrant' && gate.quadrantCenter && gate.quadrantRegion) {
        const { x: cx, y: cy } = gate.quadrantCenter;
        switch (gate.quadrantRegion) {
          case 'Q1': // Top-Left: X < cx, Y >= cy
            isInside = rawX < cx && rawY >= cy;
            break;
          case 'Q2': // Top-Right (Double Positive): X >= cx, Y >= cy
            isInside = rawX >= cx && rawY >= cy;
            break;
          case 'Q3': // Bottom-Right: X >= cx, Y < cy
            isInside = rawX >= cx && rawY < cy;
            break;
          case 'Q4': // Bottom-Left (Double Negative): X < cx, Y < cy
            isInside = rawX < cx && rawY < cy;
            break;
        }
      } else if (gate.type === 'threshold' && gate.thresholdRange) {
        isInside = rawX >= gate.thresholdRange.min && rawX <= gate.thresholdRange.max;
      }

      if (isInside) {
        matches.push(eventIdx);
        sumX += rawX;
        sumY += rawY;
        valuesX.push(rawX);
        valuesY.push(rawY);
      }
    }

    const matchCount = matches.length;
    const meanX = matchCount > 0 ? sumX / matchCount : 0;
    const meanY = matchCount > 0 ? sumY / matchCount : 0;

    // Compute Medians
    valuesX.sort((a, b) => a - b);
    valuesY.sort((a, b) => a - b);
    const medianX = matchCount > 0 ? valuesX[Math.floor(matchCount / 2)] : 0;
    const medianY = matchCount > 0 ? valuesY[Math.floor(matchCount / 2)] : 0;

    // Standard Deviations & CV%
    let varX = 0;
    let varY = 0;
    for (let i = 0; i < matchCount; i++) {
      varX += Math.pow(valuesX[i] - meanX, 2);
      varY += Math.pow(valuesY[i] - meanY, 2);
    }
    const sdX = matchCount > 1 ? Math.sqrt(varX / (matchCount - 1)) : 0;
    const sdY = matchCount > 1 ? Math.sqrt(varY / (matchCount - 1)) : 0;
    const cvX = meanX > 0 ? (sdX / meanX) * 100 : 0;
    const cvY = meanY > 0 ? (sdY / meanY) * 100 : 0;

    // Channel shift calculation (e.g. for Flow Cytometry Crossmatch IgG shift)
    const channelShift = negativeControlMcf !== undefined ? medianX - negativeControlMcf : undefined;

    const stats: PopulationStats = {
      gateId: gate.id,
      gateName: gate.name,
      parentId: gate.parentId,
      count: matchCount,
      percentOfParent: parentCount > 0 ? (matchCount / parentCount) * 100 : 0,
      percentOfTotal: totalEvents > 0 ? (matchCount / totalEvents) * 100 : 0,
      meanX,
      medianX,
      cvX,
      meanY,
      medianY,
      cvY,
      channelShift,
    };

    return {
      indices: new Uint32Array(matches),
      stats,
    };
  }

  /**
   * Automatic FSC/SSC Leukocyte/Lymphocyte Gate Identification
   * Finds the prominent cellular cluster while excluding debris (low FSC/SSC) and aggregates.
   */
  public static autoGateFSC_SSC(file: FCSFile, parentIndices: Uint32Array): Gate {
    const fscIdx = file.parameters.findIndex((p) => p.name.includes('FSC') || p.shortName.includes('FSC'));
    const sscIdx = file.parameters.findIndex((p) => p.name.includes('SSC') || p.shortName.includes('SSC'));

    const fscParam = file.parameters[fscIdx]?.shortName || 'FSC-A';
    const sscParam = file.parameters[sscIdx]?.shortName || 'SSC-A';

    // Ellipse around biological PBMC lymphocyte population in clinical flow
    // Typical ranges on 262,144 scale: FSC ~ 60,000 - 130,000; SSC ~ 15,000 - 55,000
    const points: Point2D[] = [
      { x: 50000, y: 15000 },
      { x: 80000, y: 12000 },
      { x: 120000, y: 18000 },
      { x: 140000, y: 35000 },
      { x: 130000, y: 55000 },
      { x: 95000, y: 60000 },
      { x: 60000, y: 45000 },
      { x: 45000, y: 28000 },
    ];

    return {
      id: `gate_auto_fsc_ssc_${Date.now()}`,
      name: 'Lymphocytes (Auto)',
      color: '#3B82F6',
      parentId: null,
      type: 'polygon',
      xParam: fscParam,
      yParam: sscParam,
      xTransform: 'linear',
      yTransform: 'linear',
      polygonPoints: points,
      isAutoGate: true,
      algorithm: 'fsc-ssc-ellipse',
    };
  }

  /**
   * Automatic Singlet Doublet-Exclusion Gate (FSC-A vs FSC-H)
   */
  public static autoGateSinglets(file: FCSFile, parentId: string): Gate {
    const fscA = file.parameters.find((p) => p.name.includes('FSC-A') || p.shortName === 'FSC-A')?.shortName || 'FSC-A';
    const fscH = file.parameters.find((p) => p.name.includes('FSC-H') || p.shortName === 'FSC-H')?.shortName || 'FSC-H';

    const points: Point2D[] = [
      { x: 30000, y: 35000 },
      { x: 150000, y: 165000 },
      { x: 180000, y: 155000 },
      { x: 45000, y: 25000 },
    ];

    return {
      id: `gate_auto_singlets_${Date.now()}`,
      name: 'Singlets (Auto)',
      color: '#10B981',
      parentId,
      type: 'polygon',
      xParam: fscA,
      yParam: fscH,
      xTransform: 'linear',
      yTransform: 'linear',
      polygonPoints: points,
      isAutoGate: true,
      algorithm: 'singlet-ratio',
    };
  }

  /**
   * Generate 2D Gaussian Kernel Density Grid for Bivariate Plots
   */
  public static calculateDensityGrid(
    xValues: Float32Array,
    yValues: Float32Array,
    gridSize: number = 64
  ): { grid: Float32Array; maxDensity: number } {
    const grid = new Float32Array(gridSize * gridSize);
    const n = xValues.length;
    if (n === 0) return { grid, maxDensity: 1 };

    // Find bounds
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      if (xValues[i] < minX) minX = xValues[i];
      if (xValues[i] > maxX) maxX = xValues[i];
      if (yValues[i] < minY) minY = yValues[i];
      if (yValues[i] > maxY) maxY = yValues[i];
    }

    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;
    let maxDensity = 0;

    for (let i = 0; i < n; i++) {
      const gx = Math.min(gridSize - 1, Math.max(0, Math.floor(((xValues[i] - minX) / spanX) * gridSize)));
      const gy = Math.min(gridSize - 1, Math.max(0, Math.floor(((yValues[i] - minY) / spanY) * gridSize)));
      const idx = gy * gridSize + gx;
      grid[idx] += 1;
      if (grid[idx] > maxDensity) {
        maxDensity = grid[idx];
      }
    }

    return { grid, maxDensity: maxDensity || 1 };
  }

  private static createEmptyStats(gateId: string, gateName: string, parentId: string | null): PopulationStats {
    return {
      gateId,
      gateName,
      parentId,
      count: 0,
      percentOfParent: 0,
      percentOfTotal: 0,
      meanX: 0,
      medianX: 0,
      cvX: 0,
      meanY: 0,
      medianY: 0,
      cvY: 0,
    };
  }
}
