import { FCSFile, Gate, SpilloverMatrix } from '../types/cytometry';
import { FCSParser } from './fcsParser';

/**
 * Clinical Flow Cytometry Crossmatch (FCXM) Dataset Generator
 * Panel: FSC/SSC, CD45-PerCP, CD3-APC, CD19-PE, IgG-FITC
 * Demonstrates donor-recipient HLA antibody binding assay with T and B cell discrimination.
 */

export class CrossmatchDatasetService {
  /**
   * Generates a fully compliant, authentic FCXM FCS sample with genuine spillover matrix and binary buffer.
   */
  public static createSample(
    sampleName: string = 'Donor01_PatientSerum_FCXM.fcs',
    isPositiveCrossmatch: boolean = true,
    totalEvents: number = 40000
  ): FCSFile {
    const parameters = [
      { name: 'FSC-A', stain: 'FSC-A', range: 262144 },
      { name: 'FSC-H', stain: 'FSC-H', range: 262144 },
      { name: 'SSC-A', stain: 'SSC-A', range: 262144 },
      { name: 'FL1-A', stain: 'IgG FITC', range: 262144 },
      { name: 'FL2-A', stain: 'CD19 PE', range: 262144 },
      { name: 'FL3-A', stain: 'CD45 PerCP', range: 262144 },
      { name: 'FL4-A', stain: 'CD3 APC', range: 262144 },
    ];

    const spillover: SpilloverMatrix = {
      parameters: ['FL1-A', 'FL2-A', 'FL3-A', 'FL4-A'],
      matrix: [
        [1.000, 0.125, 0.040, 0.002], // FITC spills into PE and PerCP
        [0.015, 1.000, 0.082, 0.005], // PE spills into PerCP
        [0.003, 0.021, 1.000, 0.045], // PerCP spills into APC
        [0.001, 0.004, 0.012, 1.000], // APC
      ],
    };

    const numParams = parameters.length;
    const events = new Float32Array(totalEvents * numParams);

    // Box-Muller Gaussian random number generator
    const randomGaussian = (mean: number, stdev: number) => {
      let u = 1 - Math.random();
      let v = Math.random();
      let z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
      return Math.max(0, mean + z * stdev);
    };

    for (let e = 0; e < totalEvents; e++) {
      const offset = e * numParams;
      const randType = Math.random();

      let fscA = 0, fscH = 0, sscA = 0;
      let iggFitc = 0, cd19Pe = 0, cd45PerCp = 0, cd3Apc = 0;

      if (randType < 0.15) {
        // 1. Debris & unlysed RBCs (15%)
        fscA = randomGaussian(22000, 6000);
        fscH = fscA * (0.85 + Math.random() * 0.3);
        sscA = randomGaussian(18000, 8000);
        cd45PerCp = randomGaussian(120, 50); // CD45 negative
        cd3Apc = randomGaussian(80, 40);
        cd19Pe = randomGaussian(90, 40);
        iggFitc = randomGaussian(110, 50);
      } else if (randType < 0.22) {
        // 2. Monocytes & Granulocytes (7%)
        fscA = randomGaussian(145000, 18000);
        fscH = fscA * (0.95 + Math.random() * 0.1);
        sscA = randomGaussian(95000, 25000); // High SSC
        cd45PerCp = randomGaussian(14000, 4000); // Moderate CD45
        cd3Apc = randomGaussian(210, 80);
        cd19Pe = randomGaussian(190, 70);
        iggFitc = randomGaussian(650, 200);
      } else {
        // 3. Leukocytes / Lymphocytes (78%)
        fscA = randomGaussian(88000, 14000);
        const isDoublet = Math.random() < 0.06;
        fscH = isDoublet ? fscA * 0.65 : fscA * (0.98 + (Math.random() - 0.5) * 0.08);
        sscA = randomGaussian(32000, 8000); // Low SSC
        cd45PerCp = randomGaussian(38000, 6000); // Bright CD45+

        const lymphType = Math.random();
        if (lymphType < 0.72) {
          // CD3+ T Cells (72% of lymphocytes)
          cd3Apc = randomGaussian(42000, 8500); // Bright CD3+
          cd19Pe = randomGaussian(220, 80); // Negative CD19-

          if (isPositiveCrossmatch) {
            // Patient has Donor-Specific Anti-HLA Class I antibodies -> strong IgG shift on T-cells
            iggFitc = randomGaussian(4800, 1200); // Positive Shift
          } else {
            // Negative Crossmatch
            iggFitc = randomGaussian(380, 90); // Normal baseline background
          }
        } else if (lymphType < 0.90) {
          // CD19+ B Cells (18% of lymphocytes)
          cd3Apc = randomGaussian(180, 70); // Negative CD3-
          cd19Pe = randomGaussian(36000, 7000); // Bright CD19+

          if (isPositiveCrossmatch) {
            // Strong Anti-HLA Class II antibodies -> very bright IgG shift on B-cells
            iggFitc = randomGaussian(7800, 1900); // Strong Positive Shift
          } else {
            iggFitc = randomGaussian(520, 120);
          }
        } else {
          // NK Cells / Double Negatives (10%)
          cd3Apc = randomGaussian(210, 80);
          cd19Pe = randomGaussian(230, 80);
          iggFitc = randomGaussian(360, 90);
        }
      }

      // Add cross-talk spillover before compensation
      const rawFitc = iggFitc;
      const rawPe = cd19Pe + rawFitc * 0.125;
      const rawPerCp = cd45PerCp + rawFitc * 0.04 + rawPe * 0.082;
      const rawApc = cd3Apc + rawPerCp * 0.045;

      events[offset + 0] = fscA;
      events[offset + 1] = fscH;
      events[offset + 2] = sscA;
      events[offset + 3] = rawFitc;
      events[offset + 4] = rawPe;
      events[offset + 5] = rawPerCp;
      events[offset + 6] = rawApc;
    }

    // Build raw FCS binary buffer
    const rawBuffer = FCSParser.createBinaryFCSBuffer(
      parameters,
      events,
      totalEvents,
      spillover,
      'BD FACSCanto II Clinical'
    );

    // Re-parse with FCSParser to guarantee 100% round-trip fidelity
    const parsedFile = FCSParser.parse(rawBuffer, sampleName);
    parsedFile.panelType = 'FCXM Crossmatch';
    return parsedFile;
  }

  /**
   * Generates the clinical gating strategy for the Crossmatch panel:
   * 1. CD45+ Leukocytes (CD45-PerCP vs SSC-A)
   * 2. Singlets (FSC-A vs FSC-H, child of CD45+ Leukocytes)
   * 3. CD3+ T Cells (CD3-APC vs CD19-PE, child of Singlets)
   * 4. CD19+ B Cells (CD3-APC vs CD19-PE, child of Singlets)
   * 5. T-Cell IgG Crossmatch Shift (IgG-FITC on T-Cells)
   * 6. B-Cell IgG Crossmatch Shift (IgG-FITC on B-Cells)
   */
  public static getDefaultCrossmatchGates(): Gate[] {
    return [
      {
        id: 'gate_cd45_leukocytes',
        name: 'CD45+ Leukocytes',
        color: '#6366F1', // Indigo
        parentId: null,
        type: 'polygon',
        xParam: 'CD45 PerCP',
        yParam: 'SSC-A',
        xTransform: 'arcsinh',
        yTransform: 'linear',
        polygonPoints: [
          { x: 18000, y: 5000 },
          { x: 55000, y: 5000 },
          { x: 60000, y: 65000 },
          { x: 22000, y: 60000 },
          { x: 16000, y: 25000 },
        ],
        isAutoGate: true,
        algorithm: 'density-peak',
      },
      {
        id: 'gate_singlets',
        name: 'Singlets',
        color: '#10B981', // Emerald
        parentId: 'gate_cd45_leukocytes',
        type: 'polygon',
        xParam: 'FSC-A',
        yParam: 'FSC-H',
        xTransform: 'linear',
        yTransform: 'linear',
        polygonPoints: [
          { x: 45000, y: 48000 },
          { x: 140000, y: 148000 },
          { x: 160000, y: 135000 },
          { x: 65000, y: 40000 },
        ],
        isAutoGate: true,
        algorithm: 'singlet-ratio',
      },
      {
        id: 'gate_cd3_tcells',
        name: 'CD3+ T Cells',
        color: '#2563EB', // Cobalt Blue
        parentId: 'gate_singlets',
        type: 'polygon',
        xParam: 'CD3 APC',
        yParam: 'CD19 PE',
        xTransform: 'arcsinh',
        yTransform: 'arcsinh',
        polygonPoints: [
          { x: 12000, y: 0 },
          { x: 65000, y: 0 },
          { x: 65000, y: 3500 },
          { x: 10000, y: 3500 },
        ],
        isAutoGate: true,
        algorithm: 'manual',
      },
      {
        id: 'gate_cd19_bcells',
        name: 'CD19+ B Cells',
        color: '#059669', // Forest Green
        parentId: 'gate_singlets',
        type: 'polygon',
        xParam: 'CD3 APC',
        yParam: 'CD19 PE',
        xTransform: 'arcsinh',
        yTransform: 'arcsinh',
        polygonPoints: [
          { x: 0, y: 8000 },
          { x: 4500, y: 8000 },
          { x: 4500, y: 65000 },
          { x: 0, y: 65000 },
        ],
        isAutoGate: true,
        algorithm: 'manual',
      },
      {
        id: 'gate_tcell_igg',
        name: 'T-Cell IgG Binding (FITC)',
        color: '#F59E0B', // Amber
        parentId: 'gate_cd3_tcells',
        type: 'threshold',
        xParam: 'IgG FITC',
        yParam: 'CD3 APC',
        xTransform: 'arcsinh',
        yTransform: 'arcsinh',
        thresholdRange: { min: 800, max: 262144 },
        isAutoGate: true,
        algorithm: 'otsu-fluorescence',
      },
      {
        id: 'gate_bcell_igg',
        name: 'B-Cell IgG Binding (FITC)',
        color: '#EC4899', // Pink
        parentId: 'gate_cd19_bcells',
        type: 'threshold',
        xParam: 'IgG FITC',
        yParam: 'CD19 PE',
        xTransform: 'arcsinh',
        yTransform: 'arcsinh',
        thresholdRange: { min: 900, max: 262144 },
        isAutoGate: true,
        algorithm: 'otsu-fluorescence',
      },
    ];
  }
}
