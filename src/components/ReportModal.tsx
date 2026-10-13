import React, { useState } from 'react';
import { Download, FileSpreadsheet, FileText, X } from 'lucide-react';
import jsPDF from 'jspdf';
import { FCSFile, Gate, PopulationStats } from '../types/cytometry';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: FCSFile;
  gates: Gate[];
  statsMap: Map<string, PopulationStats>;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  onClose,
  file,
  gates,
  statsMap,
}) => {
  const [reportTitle, setReportTitle] = useState('Reporte Clínico de Crossmatch por Citometría de Flujo');
  const [operatorName, setOperatorName] = useState(file.metadata.operator || 'Dr. Alex Rivera · Laboratorio de Histocompatibilidad');
  const [clinicalNotes, setClinicalNotes] = useState(
    'Muestra de PBMC de donante incubada con suero de receptor. Evaluación de unión de IgG sobre linfocitos T (CD3+) y B (CD19+) contrastada con suero control negativo.'
  );
  const [includeSpillover, setIncludeSpillover] = useState(true);

  if (!isOpen) return null;

  const handleDownloadPDF = () => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    // 1. Header (Clean hospital LIS header)
    doc.setFillColor(30, 58, 138); // blue-900
    doc.rect(0, 0, 210, 24, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('INFORME DE CITOMETRÍA DE FLUJO · LIS', 14, 11);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(224, 231, 255);
    doc.text(`Estandarización ISAC · Fecha de Emisión: ${new Date().toLocaleDateString()}`, 14, 18);

    // 2. Metadata Box
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Datos de la Muestra e Instrumento', 14, 34);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setDrawColor(203, 213, 225);
    doc.line(14, 36, 196, 36);

    const metaY = 42;
    doc.text(`Archivo FCS: ${file.name}`, 14, metaY);
    doc.text(`Total Eventos: ${file.metadata.totalEvents.toLocaleString()}`, 14, metaY + 5.5);
    doc.text(`Versión FCS: ${file.metadata.version}`, 14, metaY + 11);

    doc.text(`Citómetro: ${file.metadata.cytometer || 'BD FACSCanto II'}`, 110, metaY);
    doc.text(`Operador / Bioquímico: ${operatorName}`, 110, metaY + 5.5);
    doc.text(`Compensación: ${file.isCompensated ? 'Matriz S^-1 Activa' : 'Sin Compensar'}`, 110, metaY + 11);

    // 3. Table
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Estrategia de Gating y Frecuencias Celulares', 14, 66);
    doc.line(14, 68, 196, 68);

    doc.setFillColor(241, 245, 249);
    doc.rect(14, 71, 182, 6.5, 'F');
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('POBLACIÓN', 16, 75.5);
    doc.text('EVENTOS (N)', 82, 75.5);
    doc.text('% PADRE', 115, 75.5);
    doc.text('% TOTAL', 142, 75.5);
    doc.text('MEDIANA X / Y', 170, 75.5);

    let rowY = 82;
    doc.setFont('helvetica', 'normal');
    gates.forEach((gate, idx) => {
      const stats = statsMap.get(gate.id);
      const count = stats?.count ?? 0;
      const parentPct = (stats?.percentOfParent ?? 0).toFixed(1) + '%';
      const totalPct = (stats?.percentOfTotal ?? 0).toFixed(2) + '%';
      const medX = stats ? Math.round(stats.medianX).toLocaleString() : 'N/A';
      const medY = stats ? Math.round(stats.medianY).toLocaleString() : 'N/A';

      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(14, rowY - 4, 182, 5.5, 'F');
      }

      doc.text(gate.name, 16, rowY);
      doc.text(count.toLocaleString(), 82, rowY);
      doc.text(parentPct, 115, rowY);
      doc.text(totalPct, 142, rowY);
      doc.text(`${medX} / ${medY}`, 170, rowY);
      rowY += 6;
    });

    // 4. Clinical FCXM
    rowY += 6;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Interpretación de Crossmatch (FCXM)', 14, rowY);
    doc.line(14, rowY + 2, 196, rowY + 2);

    rowY += 8;
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.text(
      'Evaluación de compatibilidad donante-receptor. Detección de anticuerpos donante-específicos (IgG-FITC) sobre poblaciones linfocitarias T y B.',
      14,
      rowY,
      { maxWidth: 182 }
    );

    rowY += 10;
    doc.text(`Observaciones Clínicas: ${clinicalNotes}`, 14, rowY, { maxWidth: 182 });

    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      'Generado por Plataforma CYTOFLOW · Sistema LIS de Citometría · Certificación Algorítmica flowCore',
      14,
      285
    );

    doc.save(`Reporte_Citometria_${file.name.replace('.fcs', '')}.pdf`);
  };

  const handleDownloadCSV = () => {
    let csv = 'Gate_ID,Poblacion,Parent_ID,Eventos,Porcentaje_Padre,Porcentaje_Total,Media_X,Mediana_X,CV_X,Media_Y,Mediana_Y,CV_Y\n';
    gates.forEach((gate) => {
      const stats = statsMap.get(gate.id);
      if (stats) {
        csv += `"${gate.id}","${gate.name}","${gate.parentId || 'Raiz'}",${stats.count},${stats.percentOfParent.toFixed(2)},${stats.percentOfTotal.toFixed(2)},${stats.meanX.toFixed(1)},${stats.medianX.toFixed(1)},${stats.cvX.toFixed(2)},${stats.meanY.toFixed(1)},${stats.medianY.toFixed(1)},${stats.cvY.toFixed(2)}\n`;
      }
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `estadisticas_citometria_${file.name.replace('.fcs', '')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 select-none">
      <div className="w-full max-w-2xl bg-white border border-slate-300 rounded-lg shadow-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="h-13 px-6 border-b border-slate-200 flex items-center justify-between shrink-0 bg-slate-50">
          <div className="flex items-center gap-2 text-xs">
            <FileText className="w-4 h-4 text-slate-600" />
            <span className="font-bold text-slate-900 text-sm">
              Emisión de Informe de Citometría
            </span>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-4 text-xs">
          <div className="space-y-1">
            <label className="font-semibold text-slate-700">Título del Informe</label>
            <input
              type="text"
              value={reportTitle}
              onChange={(e) => setReportTitle(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-500 shadow-2xs"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-700">Bioquímico / Operador Responsable</label>
            <input
              type="text"
              value={operatorName}
              onChange={(e) => setOperatorName(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-500 shadow-2xs"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-700">Observaciones e Interpretación Clínica</label>
            <textarea
              rows={3}
              value={clinicalNotes}
              onChange={(e) => setClinicalNotes(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-500 resize-none shadow-2xs"
            />
          </div>

          <div className="flex items-center gap-2 pt-1 text-xs">
            <input
              type="checkbox"
              id="spillCheck"
              checked={includeSpillover}
              onChange={(e) => setIncludeSpillover(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="spillCheck" className="text-slate-600">
              Adjuntar matriz de compensación $SPILLOVER en el informe
            </label>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
          <button
            onClick={handleDownloadCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-slate-500" />
            <span>Descargar CSV</span>
          </button>

          <button
            onClick={handleDownloadPDF}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Generar Reporte PDF</span>
          </button>
        </div>
      </div>
    </div>
  );
};
