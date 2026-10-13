# CYTOFLOW: Browser-Based Flow Cytometry Analysis Platform

CYTOFLOW is a modern, zero-cost, browser-based flow cytometry analysis platform deployable as a static web application on Vercel Hobby. It integrates an interactive FlowJo-style hierarchical gating workbench, a node-based visual workflow automation canvas (React Flow), and an in-browser WebR/Wasm scientific computation engine with transparent execution telemetry.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> **WebR / flowCore Execution & Fallback Protocol:**
> Per the user's strict instructions, we will first execute the Scientific Proof of Concept (PoC) to test loading `flowCore` (and underlying `cytolib` C++ dependencies) via WebR inside the browser. 
> - If `flowCore` is successfully loaded from the Bioconductor WebAssembly repository (`https://webr.bioconductor.org/3.20`), all S4 methods (`read.FCS`, `compensate`, `transform`, filtering) will run directly via WebR in a dedicated Web Worker.
> - If `cytolib`/`flowCore` encounters a WebAssembly native compilation blocker (e.g. shared library dynamic link error or missing POSIX syscalls in Emscripten), CYTOFLOW will **transparently document the exact runtime diagnostic** in an interactive "Engine Diagnostics & Scientific Audit" panel, rather than silently masquerading a JS parser as flowCore. In this contingency, CYTOFLOW provides a dual-engine architecture: a high-fidelity local scientific math engine (compliant with FCS 2.0/3.0/3.1 specs, standard spillover matrix inversion, biexponential/logicle, and polygon point-in-polygon) paired with one-click export of reproducible, verified R/Bioconductor `flowCore` scripts and Plumber API payloads.

- **Confirmed Decision (Execution Model)**: Zero-cost static deployment on Vercel Hobby without paid backend databases. Local WebR / WebAssembly computation running in Web Workers, with IndexedDB persistence.
- **Confirmed Decision (Preloaded Demo Panel)**: Flow Cytometry Crossmatch (FCXM) panel: CD45 vs SSC gating, CD3-APC (T-cells) vs CD19-PE (B-cells) phenotyping, followed by IgG-FITC channel shift histograms for donor-recipient compatibility evaluation.
- **Confirmed Decision (UI Ergonomics)**: Integrated split view with tabs alternating seamlessly between the **FlowJo Gating Explorer** (hierarchical population tree, bivariate density/scatter plots, gate statistics) and the **Visual Workflow Canvas** (React Flow nodes for batch steps, quality control, transforms, gates, and reports).

---

## 1. Overview & Core Concept

- **What It Does**: CYTOFLOW enables immunologists, hematologists, and research scientists to drop FCS files (`.fcs` 2.0, 3.0, 3.1) directly into the browser, inspect fluorescence and light-scatter distributions in real time, draw and adjust polygon/quadrant/range gates, build reproducible visual pipelines, and generate publication-grade PDF/CSV reports.
- **Target Audience**: Flow cytometry core facility managers, clinical histocompatibility specialists (HLA crossmatch), and immunology researchers who require fast, reproducible gating without expensive desktop licenses.
- **Key Value**: Democratizes flow cytometry analysis with zero cloud server cost, instant zero-install launch, reproducible parameter tracking, and complete privacy (patient/sample data never leaves the user's browser).

---

## 2. User Experience & Visual Design

Following the **Universal Frontend Design Constitution** and **Science, Space & Biotech Design Reference** (`references/8_science_space_biotech.md`):

```
+---------------------------------------------------------------------------------------------------------+
| [CYTOFLOW]   Explorer   Workflows   Batch Matrix   Engine Diagnostics     | Sample: Crossmatch_Donor01.fcs |
+---------------------------------------------------------------------------------------------------------+
| HIERARCHICAL GATING TREE     | BIVARIATE WebGL DENSITY STAGE                | GATE INSPECTOR & STATS    |
|                              |                                              |                           |
| v All Events (50,000) 100%   |   SSC-A ^                                    | Population: CD3+ T Cells  |
|   v CD45+ Leuko (41,200) 82% |         |   ..::°°°•. (Debris)               | Events: 24,720 (60.0%)    |
|     * Singlets (39,140) 95%  |         |        .::###::.  (Leukocytes Gate)| Parent: CD45+ Singlets    |
|       v Lymphos (28,500) 73% |         |         ':::::'                    | Total: 49.44%             |
|         - CD3+ T (20,120)71% |         +--------------------------->        | Median IgG-FITC: 412.5    |
|         - CD19+ B (5,210)18% |                                        FSC-A | CV%: 34.2%                |
|                              | [Polygon] [Rectangle] [Quadrant] [Threshold] | Transform: Logicle (W=0.5)|
+------------------------------+----------------------------------------------+---------------------------+
| TELEMETRY & EVENT TRAY: 50,000 events parsed · Spillover: 4x4 matrix active · Engine: WebR / flowCore   |
+---------------------------------------------------------------------------------------------------------+
```

### Visual Identity & Palette
- **60% Clinical Lab Canvas**: Pristine, distraction-free neutral slate canvas (`#F8FAFC` light, `#0B0F19` obsidian dark).
- **30% Structural Panels**: Crisp 1px hairline borders (`border-slate-200 dark:border-slate-800`), flat slate cards (`#FFFFFF` / `#111827`), without bloated card-in-card nesting or pseudo-technical `//` code comments.
- **10% Calibrated Laser Accents**: Phosphor cobalt (`#2563EB`) and cytometry laser cyan (`#06B6D4`) for active gates and selection highlights. Population color-coding adheres to standard clinical conventions (Leukocytes: Slate blue, T-cells: Cobalt `#2563EB`, B-cells: Emerald `#059669`, Monocytes: Amber `#D97706`).
- **Typography**: Clean neo-grotesque (`Plus Jakarta Sans`) for UI controls and labels; dedicated tabular monospace (`font-mono tabular-nums`) for event counts, MFI (Mean/Median Fluorescence Intensity), CV%, and coordinates.

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Two-Stage Scientific PoC & Resilient Architecture
- **Approach**: CYTOFLOW will execute the scientific verification test for WebR + Bioconductor `flowCore`. We test repository endpoint `https://webr.bioconductor.org/3.20` and fallback repos. 
- **Rationale**: WebR handles pure R packages seamlessly; however, `flowCore` depends on `cytolib` (which wraps C++ HDF5 and Boost). If WebAssembly binary linkage encounters an unresolved symbol in the browser, the application immediately surfaces the exact error log in the UI, explains the exact technical status, and engages a high-precision TypeScript client engine while generating executable R `flowCore` scripts for one-click verification in native R.

### Decision 2: WebGL High-Performance Canvas Rendering
- **Approach**: Canvas 2D / WebGL rendering with fast 2D Gaussian density estimation (KDE) and downsampled display rendering (50,000 to 200,000 points displayed at 60 FPS) while calculating statistics across 100% of events.
- **Rationale**: Rendering 100,000 raw DOM SVG dots freezes the browser. A custom WebGL/Canvas2D scatter-density pipeline guarantees 60 FPS pan, zoom, and real-time gate boundary dragging.

### Decision 3: Zero-Server Persistence via IndexedDB
- **Approach**: Use `idb-keyval` / Dexie-style IndexedDB schema for storing parsed FCS buffers, projects, gating hierarchies, workflow graphs, and analysis snapshots.
- **Rationale**: Completely free hosting on Vercel Hobby with zero backend egress costs, infinite local storage limit (up to browser quota > 10GB), and complete clinical data privacy.

---

## 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CYTOFLOW APPLICATION CORE                          │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                ┌──────────────────────┴──────────────────────┐
                ▼                                             ▼
┌───────────────────────────────┐             ┌───────────────────────────────┐
│     FLOWJO GATING WORKBENCH   │             │   REACT FLOW WORKFLOW CANVAS  │
│  - Population Hierarchy Tree  │             │  - Drag-and-drop Pipeline     │
│  - Bivariate Density / Scatter│             │  - QC, Spillover, Transform   │
│  - 2D Polygon / Quadrant Gates│             │  - Gating, Stats, PDF Export  │
└───────────────┬───────────────┘             └───────────────┬───────────────┘
                │                                             │
                └──────────────────────┬──────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     SCIENTIFIC EXECUTION COORDINATOR                        │
│                                                                             │
│   [Primary: WebR / flowCore Worker]   <--->   [Telemetry & Audit Logger]    │
│   (read.FCS, compensate, transform)           - S4 method provenance        │
│                                               - WebAssembly execution state │
│   [Client Acceleration Engine]                - Exact R script generator    │
│   (60 FPS WebGL Scatter & Stats)                                            │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LOCAL PERSISTENCE LAYER                             │
│                  IndexedDB (Projects, FCS Blobs, Gates)                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Flow Cytometry Crossmatch (FCXM) Clinical Implementation
1. **Sample Ingestion**: Load Donor PBMC sample stained with CD45-PerCP, CD3-APC, CD19-PE, IgG-FITC.
2. **Gate 1 (Leukocyte Selection)**: FSC-A vs SSC-A and CD45-PerCP vs SSC-A to isolate lymphocyte/leukocyte population.
3. **Gate 2 (Singlet Discrimination)**: FSC-A vs FSC-H to exclude doublets.
4. **Gate 3 (T vs B Phenotyping)**: CD3-APC vs CD19-PE quadrant / polygon gate resolving T-cells (CD3+CD19-) and B-cells (CD3-CD19+).
5. **Channel Histogram & Crossmatch Metrics**: Univariate histogram of IgG-FITC on T-cell and B-cell gates calculating:
   - Median Channel Fluorescence (MCF)
   - Channel Shift relative to negative control serum ($\Delta \text{MCF}$)
   - Positive/Negative crossmatch threshold assessment with clinical warning.

### Step-by-Step Execution Sequence
1. **Scientific Feasibility PoC**: Implement the WebR initialization worker and check flowCore availability from the Bioconductor WebR repository. Present full diagnostics.
2. **FCS Parser & Data Ingestion**: Parse binary FCS 2.0/3.0/3.1 files, read header offsets, extract `$SPILLOVER` / `$SPILL` compensation matrices, parameter metadata (`$PnN`, `$PnS`, `$PnR`), and binary event matrices.
3. **Interactive FlowJo Explorer**: Construct the 3-pane workbench (Hierarchy Tree, WebGL Bivariate Scatter/Contour Stage with Polygon/Rectangle/Quadrant drawing tools, and Property/Stats inspector).
4. **Visual Workflow Studio**: Connectable node graph using `@xyflow/react` allowing step-by-step pipeline execution, parameter adjustment, and intermediate inspection.
5. **Crossmatch Clinical Demo**: Preload the CD3-APC / CD19-PE / CD45 / IgG-FITC FCXM dataset with one-click interactive gating.
6. **Reporting Engine**: Client-side publication-grade PDF and CSV export capturing gating hierarchy, event counts, percentages, MFIs, and vector gate plots.
