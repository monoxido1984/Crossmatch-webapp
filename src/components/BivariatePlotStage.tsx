import React, { useEffect, useRef, useState } from 'react';
import { Crosshair, Move, Square, Sliders, Palette } from 'lucide-react';
import { FCSFile, Gate, Point2D, TransformType } from '../types/cytometry';
import { CytometryMath } from '../services/cytometryMath';

interface BivariatePlotStageProps {
  file: FCSFile;
  activeGateId: string | null;
  gates: Gate[];
  parentIndices: Uint32Array;
  onAddGate: (gate: Gate) => void;
  selectedXParam: string;
  selectedYParam: string;
  onSelectXParam: (param: string) => void;
  onSelectYParam: (param: string) => void;
}

export const BivariatePlotStage: React.FC<BivariatePlotStageProps> = ({
  file,
  activeGateId,
  gates,
  parentIndices,
  onAddGate,
  selectedXParam,
  selectedYParam,
  onSelectXParam,
  onSelectYParam,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [xTransform, setXTransform] = useState<TransformType>('arcsinh');
  const [yTransform, setYTransform] = useState<TransformType>('arcsinh');

  const [drawMode, setDrawMode] = useState<'view' | 'polygon' | 'rectangle' | 'quadrant'>('view');
  const [viewType, setViewType] = useState<'bivariate' | 'histogram'>('bivariate');
  const [colorMode, setColorMode] = useState<'flowjo' | 'monochrome'>('flowjo');

  const [polygonDraft, setPolygonDraft] = useState<Point2D[]>([]);
  const [rectStart, setRectStart] = useState<Point2D | null>(null);
  const [rectCurrent, setRectCurrent] = useState<Point2D | null>(null);


  const xParam = file.parameters.find((p) => p.name === selectedXParam || p.shortName === selectedXParam) || file.parameters[0];
  const yParam = file.parameters.find((p) => p.name === selectedYParam || p.shortName === selectedYParam) || file.parameters[1] || file.parameters[0];

  useEffect(() => {
    setXTransform(/^(FSC|SSC)/i.test(xParam.name) ? 'linear' : 'arcsinh');
    setYTransform(/^(FSC|SSC)/i.test(yParam.name) ? 'linear' : 'arcsinh');
  }, [file.id, selectedXParam, selectedYParam]);

  useEffect(() => {
    setPolygonDraft([]);
    setRectStart(null);
    setRectCurrent(null);
    setDrawMode('view');
  }, [file.id]);

  const xMin = 0;
  const xMax = xParam ? xParam.range : 262144;
  const yMin = 0;
  const yMax = yParam ? yParam.range : 262144;

  const tXMin = CytometryMath.transformValue(xMin, xTransform, xMax);
  const tXMax = CytometryMath.transformValue(xMax, xTransform, xMax);
  const tYMin = CytometryMath.transformValue(yMin, yTransform, yMax);
  const tYMax = CytometryMath.transformValue(yMax, yTransform, yMax);

  const dataToScreen = (rawX: number, rawY: number, width: number, height: number): { sx: number; sy: number } => {
    const pad = 44;
    const plotW = width - pad * 2;
    const plotH = height - pad * 2;

    const tx = CytometryMath.transformValue(rawX, xTransform, xMax);
    const ty = CytometryMath.transformValue(rawY, yTransform, yMax);

    const nx = (tx - tXMin) / (tXMax - tXMin || 1);
    const ny = (ty - tYMin) / (tYMax - tYMin || 1);

    const sx = pad + nx * plotW;
    const sy = height - pad - ny * plotH;

    return { sx, sy };
  };

  const screenToData = (sx: number, sy: number, width: number, height: number): Point2D => {
    const pad = 44;
    const plotW = width - pad * 2;
    const plotH = height - pad * 2;

    const nx = (sx - pad) / plotW;
    const ny = (height - pad - sy) / plotH;

    const tx = tXMin + nx * (tXMax - tXMin);
    const ty = tYMin + ny * (tYMax - tYMin);

    const rawX = CytometryMath.inverseTransform(tx, xTransform);
    const rawY = CytometryMath.inverseTransform(ty, yTransform);

    return { x: Math.max(0, rawX), y: Math.max(0, rawY) };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const pad = 44;
    const plotW = width - pad * 2;
    const plotH = height - pad * 2;

    // Crisp white background (paper standard)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Plot plotting field
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(pad, pad, plotW, plotH);

    // Subtle grid lines
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      const gx = pad + (plotW / 5) * i;
      const gy = pad + (plotH / 5) * i;
      ctx.beginPath();
      ctx.moveTo(gx, pad);
      ctx.lineTo(gx, height - pad);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(pad, gy);
      ctx.lineTo(width - pad, gy);
      ctx.stroke();
    }

    const eventsData = file.isCompensated && file.compensatedEvents ? file.compensatedEvents : file.events;
    const numParams = file.parameters.length;
    const xIdx = xParam.index;
    const yIdx = yParam.index;

    if (viewType === 'histogram') {
      // 1D Histogram Mode (Clean FlowJo light blue / slate bars)
      const binCount = 120;
      const bins = new Uint32Array(binCount);
      let maxBin = 0;

      for (let i = 0; i < parentIndices.length; i++) {
        const eIdx = parentIndices[i];
        const val = eventsData[eIdx * numParams + xIdx];
        const tVal = CytometryMath.transformValue(val, xTransform, xMax);
        const norm = (tVal - tXMin) / (tXMax - tXMin || 1);
        const bin = Math.min(binCount - 1, Math.max(0, Math.floor(norm * binCount)));
        bins[bin]++;
        if (bins[bin] > maxBin) maxBin = bins[bin];
      }

      ctx.fillStyle = '#2563eb';
      const binW = plotW / binCount;
      for (let b = 0; b < binCount; b++) {
        const h = maxBin > 0 ? (bins[b] / maxBin) * (plotH - 8) : 0;
        ctx.fillRect(pad + b * binW, height - pad - h, binW - 0.5, h);
      }
    } else {
      // 2D Bivariate Scatter Mode (Standard FlowJo Density on White Paper)
      const renderCount = Math.min(parentIndices.length, 10000);
      const step = Math.max(1, Math.ceil(parentIndices.length / Math.max(1, renderCount)));

      for (let i = 0; i < parentIndices.length; i += step) {
        const eIdx = parentIndices[i];
        const rx = eventsData[eIdx * numParams + xIdx];
        const ry = eventsData[eIdx * numParams + yIdx];

        const { sx, sy } = dataToScreen(rx, ry, width, height);
        if (sx < pad || sx > width - pad || sy < pad || sy > height - pad) continue;

        if (colorMode === 'monochrome') {
          ctx.fillStyle = 'rgba(30, 41, 59, 0.45)';
        } else {
          // Classic FlowJo density coloring on white background
          const ratio = (rx + ry) / (xMax + yMax);
          if (ratio > 0.48) {
            ctx.fillStyle = 'rgba(220, 38, 38, 0.7)'; // High density red
          } else if (ratio > 0.28) {
            ctx.fillStyle = 'rgba(217, 119, 6, 0.6)'; // Mid density orange
          } else if (ratio > 0.15) {
            ctx.fillStyle = 'rgba(16, 185, 129, 0.5)'; // Green
          } else {
            ctx.fillStyle = 'rgba(37, 99, 235, 0.45)'; // Low density blue
          }
        }

        ctx.fillRect(sx - 1, sy - 1, 2, 2);
      }
    }

    // Overlay Gates
    gates.forEach((gate) => {
      const matchesAxes =
        (gate.xParam === xParam.name || gate.xParam === xParam.stain || gate.xParam === xParam.shortName) &&
        (gate.yParam === yParam.name || gate.yParam === yParam.stain || gate.yParam === yParam.shortName);

      if (!matchesAxes) return;

      ctx.save();
      ctx.strokeStyle = gate.color;
      ctx.lineWidth = 1.5;
      ctx.fillStyle = `${gate.color}15`;

      if (gate.type === 'polygon' && gate.polygonPoints && gate.polygonPoints.length >= 3) {
        ctx.beginPath();
        gate.polygonPoints.forEach((p, idx) => {
          const { sx, sy } = dataToScreen(p.x, p.y, width, height);
          if (idx === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        });
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        const firstPt = dataToScreen(gate.polygonPoints[0].x, gate.polygonPoints[0].y, width, height);
        ctx.fillStyle = '#0f172a';
        ctx.font = '11px sans-serif';
        ctx.fillText(gate.name, firstPt.sx + 4, firstPt.sy - 5);
      } else if (gate.type === 'rectangle' && gate.rectangleBounds) {
        const { minX, maxX, minY, maxY } = gate.rectangleBounds;
        const p1 = dataToScreen(minX, maxY, width, height);
        const p2 = dataToScreen(maxX, minY, width, height);
        const rw = p2.sx - p1.sx;
        const rh = p2.sy - p1.sy;
        ctx.fillRect(p1.sx, p1.sy, rw, rh);
        ctx.strokeRect(p1.sx, p1.sy, rw, rh);

        ctx.fillStyle = '#0f172a';
        ctx.font = '11px sans-serif';
        ctx.fillText(gate.name, p1.sx + 4, p1.sy - 5);
      }

      ctx.restore();
    });

    // Drawing Draft
    if (drawMode === 'polygon' && polygonDraft.length > 0) {
      ctx.save();
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      polygonDraft.forEach((p, idx) => {
        const { sx, sy } = dataToScreen(p.x, p.y, width, height);
        if (idx === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);

        ctx.fillStyle = '#2563eb';
        ctx.fillRect(sx - 2, sy - 2, 4, 4);
      });
      ctx.stroke();
      ctx.restore();
    } else if (drawMode === 'rectangle' && rectStart && rectCurrent) {
      ctx.save();
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      const p1 = dataToScreen(Math.min(rectStart.x, rectCurrent.x), Math.max(rectStart.y, rectCurrent.y), width, height);
      const p2 = dataToScreen(Math.max(rectStart.x, rectCurrent.x), Math.min(rectStart.y, rectCurrent.y), width, height);
      ctx.strokeRect(p1.sx, p1.sy, p2.sx - p1.sx, p2.sy - p1.sy);
      ctx.restore();
    }

    // Outer Axis Border
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.strokeRect(pad, pad, plotW, plotH);

    // Axis Labels
    ctx.fillStyle = '#334155';
    ctx.font = '11px sans-serif';
    ctx.fillText(`${xParam.shortName} (${xTransform})`, width / 2 - 35, height - 14);

    ctx.save();
    ctx.translate(14, height / 2 + 30);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${yParam.shortName} (${yTransform})`, 0, 0);
    ctx.restore();
  }, [
    file,
    xParam,
    yParam,
    xTransform,
    yTransform,
    colorMode,
    viewType,
    parentIndices,
    gates,
    polygonDraft,
    rectStart,
    rectCurrent,
  ]);

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const sy = (e.clientY - rect.top) * (canvas.height / rect.height);

    const dataPt = screenToData(sx, sy, canvas.width, canvas.height);

    if (drawMode === 'polygon') {
      if (polygonDraft.length >= 3) {
        const first = polygonDraft[0];
        const screenFirst = dataToScreen(first.x, first.y, canvas.width, canvas.height);
        const dist = Math.hypot(sx - screenFirst.sx, sy - screenFirst.sy);
        if (dist < 12) {
          const newGate: Gate = {
            id: `gate_${Date.now()}`,
            name: `Gate Poligonal ${gates.length + 1}`,
            color: '#2563EB',
            parentId: activeGateId,
            type: 'polygon',
            xParam: xParam.shortName,
            yParam: yParam.shortName,
            xTransform,
            yTransform,
            polygonPoints: polygonDraft,
          };
          onAddGate(newGate);
          setPolygonDraft([]);
          setDrawMode('view');
          return;
        }
      }
      setPolygonDraft((prev) => [...prev, dataPt]);
    } else if (drawMode === 'rectangle') {
      setRectStart(dataPt);
      setRectCurrent(dataPt);
    } else if (drawMode === 'quadrant') {
      const colors = ['#2563EB', '#059669', '#D97706', '#475569'];
      const regions: ('Q1' | 'Q2' | 'Q3' | 'Q4')[] = ['Q1', 'Q2', 'Q3', 'Q4'];
      const names = ['Q1 (-/+)', 'Q2 (+/+)', 'Q3 (+/-)', 'Q4 (-/-)'];

      regions.forEach((reg, i) => {
        const qGate: Gate = {
          id: `gate_quad_${Date.now()}_${reg}`,
          name: names[i],
          color: colors[i],
          parentId: activeGateId,
          type: 'quadrant',
          xParam: xParam.shortName,
          yParam: yParam.shortName,
          xTransform,
          yTransform,
          quadrantCenter: dataPt,
          quadrantRegion: reg,
        };
        onAddGate(qGate);
      });
      setDrawMode('view');
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const sy = (e.clientY - rect.top) * (canvas.height / rect.height);

    const dataPt = screenToData(sx, sy, canvas.width, canvas.height);


    if (drawMode === 'rectangle' && rectStart) {
      setRectCurrent(dataPt);
    }
  };

  const handleCanvasMouseUp = () => {
    if (drawMode === 'rectangle' && rectStart && rectCurrent) {
      const minX = Math.min(rectStart.x, rectCurrent.x);
      const maxX = Math.max(rectStart.x, rectCurrent.x);
      const minY = Math.min(rectStart.y, rectCurrent.y);
      const maxY = Math.max(rectStart.y, rectCurrent.y);

      if (maxX - minX > 500 && maxY - minY > 500) {
        const newGate: Gate = {
          id: `gate_${Date.now()}`,
          name: `Gate Rectangular ${gates.length + 1}`,
          color: '#059669',
          parentId: activeGateId,
          type: 'rectangle',
          xParam: xParam.shortName,
          yParam: yParam.shortName,
          xTransform,
          yTransform,
          rectangleBounds: { minX, maxX, minY, maxY },
        };
        onAddGate(newGate);
      }

      setRectStart(null);
      setRectCurrent(null);
      setDrawMode('view');
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-none bg-slate-50">
      {/* Top Controls Toolbar */}
      <div className="h-12 border-b border-slate-200 px-4 flex items-center justify-between shrink-0 bg-white">
        <div className="flex items-center gap-4">
          {/* X Parameter Dropdown */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-semibold text-slate-600">Eje X:</span>
            <select
              value={selectedXParam}
              onChange={(e) => onSelectXParam(e.target.value)}
              className="border border-slate-300 rounded px-2 py-1 text-xs bg-white text-slate-800 outline-none focus:border-blue-500 shadow-2xs"
            >
              {file.parameters.map((p) => (
                <option key={p.name} value={p.shortName}>
                  {p.shortName} {p.stain ? `(${p.name})` : ''}
                </option>
              ))}
            </select>
            <select
              value={xTransform}
              onChange={(e) => setXTransform(e.target.value as TransformType)}
              className="border border-slate-300 rounded px-2 py-1 text-xs bg-white text-slate-700 outline-none focus:border-blue-500 shadow-2xs"
            >
              <option value="linear">Lineal</option>
              <option value="arcsinh">Arcsinh</option>
              <option value="log10">Log10</option>
              <option value="logicle">Logicle</option>
            </select>
          </div>

          {/* Y Parameter Dropdown */}
          {viewType === 'bivariate' && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="font-semibold text-slate-600">Eje Y:</span>
              <select
                value={selectedYParam}
                onChange={(e) => onSelectYParam(e.target.value)}
                className="border border-slate-300 rounded px-2 py-1 text-xs bg-white text-slate-800 outline-none focus:border-blue-500 shadow-2xs"
              >
                {file.parameters.map((p) => (
                  <option key={p.name} value={p.shortName}>
                    {p.shortName} {p.stain ? `(${p.name})` : ''}
                  </option>
                ))}
              </select>
              <select
                value={yTransform}
                onChange={(e) => setYTransform(e.target.value as TransformType)}
                className="border border-slate-300 rounded px-2 py-1 text-xs bg-white text-slate-700 outline-none focus:border-blue-500 shadow-2xs"
              >
                <option value="linear">Lineal</option>
                <option value="arcsinh">Arcsinh</option>
                <option value="log10">Log10</option>
                <option value="logicle">Logicle</option>
              </select>
            </div>
          )}
        </div>

        {/* View Mode & Gating Tools */}
        <div className="flex items-center gap-2">
          {/* Plot Type */}
          <div className="flex items-center rounded border border-slate-200 bg-slate-100 p-0.5 text-xs">
            <button
              onClick={() => setViewType('bivariate')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                viewType === 'bivariate'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Gráfico Bivariado
            </button>
            <button
              onClick={() => setViewType('histogram')}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                viewType === 'histogram'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Histograma 1D
            </button>
          </div>

          {/* Gating Tools */}
          {viewType === 'bivariate' && (
            <div className="flex items-center rounded border border-slate-200 bg-slate-100 p-0.5 text-xs">
              <button
                onClick={() => {
                  setDrawMode('view');
                  setPolygonDraft([]);
                }}
                className={`p-1.5 rounded transition-colors ${
                  drawMode === 'view' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Modo inspección / cursor"
              >
                <Move className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => {
                  setDrawMode('polygon');
                  setPolygonDraft([]);
                }}
                className={`flex items-center gap-1 px-2 py-1 rounded font-medium transition-colors ${
                  drawMode === 'polygon'
                    ? 'bg-white text-blue-700 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Dibujar gate poligonal"
              >
                <Crosshair className="w-3.5 h-3.5" />
                <span>Polígono</span>
              </button>

              <button
                onClick={() => {
                  setDrawMode('rectangle');
                  setPolygonDraft([]);
                }}
                className={`flex items-center gap-1 px-2 py-1 rounded font-medium transition-colors ${
                  drawMode === 'rectangle'
                    ? 'bg-white text-blue-700 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Dibujar gate rectangular"
              >
                <Square className="w-3.5 h-3.5" />
                <span>Caja</span>
              </button>

              <button
                onClick={() => {
                  setDrawMode('quadrant');
                  setPolygonDraft([]);
                }}
                className={`flex items-center gap-1 px-2 py-1 rounded font-medium transition-colors ${
                  drawMode === 'quadrant'
                    ? 'bg-white text-blue-700 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Fijar cuadrantes (Q1 a Q4)"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Cuadrante</span>
              </button>
            </div>
          )}

          {/* Color Mode Toggle */}
          <button
            onClick={() => setColorMode((prev) => (prev === 'flowjo' ? 'monochrome' : 'flowjo'))}
            className="p-1.5 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors shadow-2xs"
            title="Cambiar paleta de densidad"
          >
            <Palette className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Canvas Viewport (Paper White) */}
      <div className="flex-1 relative flex items-center justify-center p-4">
        <canvas
          ref={canvasRef}
          width={640}
          height={520}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          className={`max-w-full max-h-full rounded border border-slate-300 shadow-sm bg-white ${
            drawMode !== 'view' ? 'cursor-crosshair' : 'cursor-default'
          }`}
        />

        {/* Drawing Hint Banner */}
        {drawMode === 'polygon' && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 px-3 py-1 rounded border border-blue-200 bg-blue-50 text-blue-800 text-xs shadow-xs pointer-events-none">
            {polygonDraft.length === 0
              ? 'Haga clic en el gráfico para colocar el primer vértice del polígono'
              : `Polígono en curso: ${polygonDraft.length} vértices. Haga clic en el inicio para cerrar el gate.`}
          </div>
        )}
      </div>
    </div>
  );
};
