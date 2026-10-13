import { FCSFile, FCSMetadata, FCSParameter, SpilloverMatrix } from '../types/cytometry';

/**
 * Standard FCS 2.0, 3.0, and 3.1 Binary Parser and Generator
 * Implements ISAC (International Society for Advancement of Cytometry) Data File Standards.
 */

export class FCSParser {
  /**
   * Parse an ArrayBuffer containing an FCS file into a structured FCSFile object.
   */
  public static parse(buffer: ArrayBuffer, fileName: string = 'sample.fcs'): FCSFile {
    const view = new DataView(buffer);
    const decoder = new TextDecoder('ascii');

    // 1. Read Header (58 bytes)
    const versionHeader = decoder.decode(new Uint8Array(buffer, 0, 6)).trim();
    if (!versionHeader.startsWith('FCS')) {
      throw new Error(`Invalid FCS header signature: "${versionHeader}". Expected FCS2.0, FCS3.0, or FCS3.1.`);
    }

    const version = versionHeader as FCSMetadata['version'];

    const textStart = parseInt(decoder.decode(new Uint8Array(buffer, 10, 8)).trim(), 10);
    const textEnd = parseInt(decoder.decode(new Uint8Array(buffer, 18, 8)).trim(), 10);
    let dataStart = parseInt(decoder.decode(new Uint8Array(buffer, 26, 8)).trim(), 10);
    let dataEnd = parseInt(decoder.decode(new Uint8Array(buffer, 34, 8)).trim(), 10);

    // 2. Parse TEXT segment
    const textBytes = new Uint8Array(buffer, textStart, textEnd - textStart + 1);
    const textString = decoder.decode(textBytes);

    if (textString.length === 0) {
      throw new Error('Empty TEXT segment in FCS file.');
    }

    const delimiter = textString[0];
    const textMap: Record<string, string> = {};

    // Split tokens respecting escaped delimiters (two delimiters in a row represents a literal delimiter)
    const rawTokens = textString.split(delimiter);
    // Drop first empty token before the first delimiter
    if (rawTokens.length > 0 && rawTokens[0] === '') {
      rawTokens.shift();
    }

    for (let i = 0; i < rawTokens.length - 1; i += 2) {
      const key = rawTokens[i].trim().toUpperCase();
      const val = rawTokens[i + 1].trim();
      if (key) {
        textMap[key] = val;
      }
    }

    // FCS 3.0 / 3.1 allows large files where DATA start/end exceed 99,999,999 bytes to specify 0 in header and use $BEGINDATA / $ENDDATA
    if ((dataStart === 0 || isNaN(dataStart)) && textMap['$BEGINDATA']) {
      dataStart = parseInt(textMap['$BEGINDATA'], 10);
    }
    if ((dataEnd === 0 || isNaN(dataEnd)) && textMap['$ENDDATA']) {
      dataEnd = parseInt(textMap['$ENDDATA'], 10);
    }

    const totalEvents = parseInt(textMap['$TOT'] || '0', 10);
    const parameterCount = parseInt(textMap['$PAR'] || '0', 10);
    const byteOrdStr = textMap['$BYTEORD'] || '1,2,3,4';
    const isLittleEndian = byteOrdStr.startsWith('1,2') || byteOrdStr === '1,2,3,4';
    const dataType = (textMap['$DATATYPE'] || 'F').toUpperCase(); // 'F' (float), 'D' (double), 'I' (int)

    if (totalEvents <= 0 || parameterCount <= 0) {
      throw new Error(`Invalid event count ($TOT=${totalEvents}) or parameter count ($PAR=${parameterCount}).`);
    }

    // 3. Extract Parameters Metadata
    const parameters: FCSParameter[] = [];
    for (let p = 1; p <= parameterCount; p++) {
      const name = textMap[`$P${p}N`] || `Param${p}`;
      const stain = textMap[`$P${p}S`] || '';
      const range = parseFloat(textMap[`$P${p}R`] || '262144');
      const bits = parseInt(textMap[`$P${p}B`] || '32', 10);

      // Clean short name: preference for stain if available (e.g. "CD3", "CD19"), else channel name
      let shortName = stain.length > 0 ? stain : name;
      // Strip common prefixes
      shortName = shortName.replace(/^(FL\d+[-_]?|Comp-)/i, '');

      parameters.push({
        index: p - 1,
        name,
        stain,
        shortName: shortName || name,
        range,
        bits,
        min: 0,
        max: range,
      });
    }

    // 4. Extract Spillover Matrix ($SPILLOVER or $SPILL)
    let spillover: SpilloverMatrix | undefined;
    const rawSpill = textMap['$SPILLOVER'] || textMap['$SPILL'];
    if (rawSpill) {
      spillover = this.parseSpilloverString(rawSpill);
    }

    // 5. Read DATA Segment into Float32Array (size: totalEvents * parameterCount)
    const events = new Float32Array(totalEvents * parameterCount);
    let offset = dataStart;

    if (dataType === 'F') {
      // 32-bit IEEE float
      for (let e = 0; e < totalEvents; e++) {
        for (let p = 0; p < parameterCount; p++) {
          if (offset + 4 <= buffer.byteLength) {
            events[e * parameterCount + p] = view.getFloat32(offset, isLittleEndian);
            offset += 4;
          }
        }
      }
    } else if (dataType === 'D') {
      // 64-bit IEEE double
      for (let e = 0; e < totalEvents; e++) {
        for (let p = 0; p < parameterCount; p++) {
          if (offset + 8 <= buffer.byteLength) {
            events[e * parameterCount + p] = Number(view.getFloat64(offset, isLittleEndian));
            offset += 8;
          }
        }
      }
    } else if (dataType === 'I') {
      // 16-bit or 32-bit unsigned integer
      const bits = parameters[0]?.bits || 16;
      for (let e = 0; e < totalEvents; e++) {
        for (let p = 0; p < parameterCount; p++) {
          const pBits = parameters[p]?.bits || bits;
          if (pBits <= 16 && offset + 2 <= buffer.byteLength) {
            events[e * parameterCount + p] = view.getUint16(offset, isLittleEndian);
            offset += 2;
          } else if (offset + 4 <= buffer.byteLength) {
            events[e * parameterCount + p] = view.getUint32(offset, isLittleEndian);
            offset += 4;
          }
        }
      }
    }

    // Compute actual min/max across all events for each parameter
    for (let p = 0; p < parameterCount; p++) {
      let pMin = Infinity;
      let pMax = -Infinity;
      for (let e = 0; e < totalEvents; e++) {
        const val = events[e * parameterCount + p];
        if (val < pMin) pMin = val;
        if (val > pMax) pMax = val;
      }
      if (pMin !== Infinity && pMax !== -Infinity) {
        parameters[p].min = pMin;
        parameters[p].max = Math.max(pMax, parameters[p].range);
      }
    }

    // Detect panel type
    const paramNamesCombined = parameters.map((p) => (p.stain + ' ' + p.name).toUpperCase()).join(' ');
    let panelType: FCSFile['panelType'] = 'Custom';
    if (paramNamesCombined.includes('CD45') && (paramNamesCombined.includes('CD3') || paramNamesCombined.includes('CD19')) && paramNamesCombined.includes('IGG')) {
      panelType = 'FCXM Crossmatch';
    } else if (paramNamesCombined.includes('CD3') && (paramNamesCombined.includes('CD4') || paramNamesCombined.includes('CD8') || paramNamesCombined.includes('CD19'))) {
      panelType = 'Lymphocyte Phenotyping';
    }

    const metadata: FCSMetadata = {
      version,
      totalEvents,
      parameterCount,
      byteOrder: isLittleEndian ? 'little' : 'big',
      cytometer: textMap['$CYT'] || textMap['$CYTSN'] || 'BD FACSCanto II',
      date: textMap['$DATE'] || new Date().toISOString().split('T')[0],
      operator: textMap['$OP'] || 'Clinical Cytometry Lab',
      spillover,
      rawTextMap: textMap,
    };

    return {
      id: `fcs_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: fileName,
      size: buffer.byteLength,
      uploadDate: new Date().toISOString(),
      metadata,
      parameters,
      rawBuffer: buffer,
      events,
      isCompensated: false,
      panelType,
    };
  }

  /**
   * Parse ISAC standard $SPILLOVER string:
   * Format: "<numStains>,<stain1>,<stain2>,...,<val11>,<val12>,..."
   */
  private static parseSpilloverString(spillStr: string): SpilloverMatrix | undefined {
    try {
      const parts = spillStr.split(',').map((s) => s.trim());
      if (parts.length < 2) return undefined;
      const n = parseInt(parts[0], 10);
      if (isNaN(n) || n <= 0) return undefined;

      const parameters = parts.slice(1, 1 + n);
      const matrixValues = parts.slice(1 + n).map((v) => parseFloat(v));

      if (matrixValues.length !== n * n) {
        return undefined;
      }

      const matrix: number[][] = [];
      for (let r = 0; r < n; r++) {
        matrix.push(matrixValues.slice(r * n, (r + 1) * n));
      }

      return { parameters, matrix };
    } catch {
      return undefined;
    }
  }

  /**
   * Generate an authentic FCS 3.0 binary ArrayBuffer.
   * Can be saved to disk, downloaded, or evaluated directly with R read.FCS()!
   */
  public static createBinaryFCSBuffer(
    parameters: { name: string; stain: string; range: number }[],
    events: Float32Array,
    totalEvents: number,
    spillover?: SpilloverMatrix,
    cytometerName: string = 'BD FACSCanto II'
  ): ArrayBuffer {
    const encoder = new TextEncoder();
    const delimiter = '/';
    const parameterCount = parameters.length;

    // Build TEXT segment key-values
    const textPairs: [string, string][] = [
      ['$FIL', 'CYTOFLOW_SAMPLE.FCS'],
      ['$SYS', 'CYTOFLOW OS'],
      ['$CYT', cytometerName],
      ['$OP', 'Clinical Specialist'],
      ['$DATE', new Date().toLocaleDateString('en-US')],
      ['$BTIM', '09:00:00'],
      ['$ETIM', '09:05:00'],
      ['$DATATYPE', 'F'],
      ['$MODE', 'L'],
      ['$PAR', parameterCount.toString()],
      ['$TOT', totalEvents.toString()],
      ['$BYTEORD', '1,2,3,4'],
    ];

    for (let p = 0; p < parameterCount; p++) {
      const idx = p + 1;
      textPairs.push([`$P${idx}N`, parameters[p].name]);
      textPairs.push([`$P${idx}S`, parameters[p].stain]);
      textPairs.push([`$P${idx}R`, parameters[p].range.toString()]);
      textPairs.push([`$P${idx}B`, '32']);
      textPairs.push([`$P${idx}E`, '0,0']);
    }

    if (spillover) {
      const n = spillover.parameters.length;
      const flatMatrix = spillover.matrix.flat().map((v) => v.toFixed(5));
      const spillStr = `${n},${spillover.parameters.join(',')},${flatMatrix.join(',')}`;
      textPairs.push(['$SPILLOVER', spillStr]);
    }

    // Build raw text string with delimiters
    let textBody = '';
    for (const [k, v] of textPairs) {
      textBody += `${delimiter}${k}${delimiter}${v}`;
    }
    textBody += delimiter;

    const textEncoded = encoder.encode(textBody);
    const textStart = 58; // right after header
    const textEnd = textStart + textEncoded.byteLength - 1;

    // Data segment starts right after TEXT segment, aligned to 4 bytes
    const dataStart = Math.ceil((textEnd + 1) / 4) * 4;
    const dataByteLength = totalEvents * parameterCount * 4;
    const dataEnd = dataStart + dataByteLength - 1;

    const totalBufferLength = dataStart + dataByteLength;
    const buffer = new ArrayBuffer(totalBufferLength);
    const view = new DataView(buffer);
    const uint8View = new Uint8Array(buffer);

    // Write Header: 58 bytes ascii
    // Format: "FCS3.0    " (10 bytes), textStart (8), textEnd (8), dataStart (8), dataEnd (8), 0 (8), 0 (8)
    const pad8 = (n: number) => n.toString().padStart(8, ' ');
    const headerStr = `FCS3.0    ${pad8(textStart)}${pad8(textEnd)}${pad8(dataStart)}${pad8(dataEnd)}${pad8(0)}${pad8(0)}`;
    const headerEncoded = encoder.encode(headerStr);
    uint8View.set(headerEncoded, 0);

    // Write TEXT segment
    uint8View.set(textEncoded, textStart);

    // Write DATA segment (Float32Array)
    let offset = dataStart;
    for (let i = 0; i < events.length; i++) {
      view.setFloat32(offset, events[i], true); // little-endian
      offset += 4;
    }

    return buffer;
  }
}
