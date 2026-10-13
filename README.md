# CYTOFLOW — Sistema de Análisis de Citometría de Flujo (LIS)

CYTOFLOW es una aplicación web moderna, científica y **100% autocontenida** para el análisis de archivos FCS de citometría de flujo, gating jerárquico (estilo FlowJo), flujos de trabajo visuales automatizados y evaluación de crossmatch (FCXM).

Está diseñada para ejecutarse **enteramente en el navegador del usuario** mediante WebAssembly, Web Workers e IndexedDB, por lo que **no requiere backend de pago, ni base de datos en la nube, ni servidores de R externos obligatorios**.

---

## 🚀 Despliegue en Vercel (100% Gratuito en Plan Hobby)

La aplicación es un Single Page Application (SPA) estático compilado con Vite. No requiere configurar variables de entorno obligatorias ni instalar servidores.

### Opción A: Despliegue desde GitHub (Recomendada - 2 Clics)

1. Sube este repositorio a tu cuenta de **GitHub**.
2. Ingresa a [Vercel](https://vercel.com) e inicia sesión.
3. Haz clic en **"Add New..."** -> **"Project"**.
4. Selecciona tu repositorio de GitHub `cytoflow`.
5. Vercel detectará automáticamente:
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
6. Haz clic en **"Deploy"**.
7. En menos de 1 minuto tendrás tu aplicación funcionando en una URL pública (ejemplo: `https://cytoflow.vercel.app`) de forma totalmente gratuita y sin costos de mantenimiento.

### Opción B: Despliegue directo mediante Vercel CLI

Si tienes Node.js en tu máquina, puedes desplegar directamente desde la terminal sin abrir el navegador:

```bash
# 1. En la raíz del proyecto, ejecuta:
npx vercel

# 2. Responde las preguntas por defecto:
# Set up and deploy? [Y]
# Which scope? [Tu usuario]
# Link to existing project? [N]
# Project name? cytoflow
# Directory? ./
# Want to modify settings? [N]

# 3. Para desplegar a producción definitiva:
npx vercel --prod
```

---

## 🔒 Privacidad y Arquitectura Autocontenida

- **Cero transferencia de datos sensibles**: Los archivos `.fcs` de los pacientes se leen y procesan directamente en la memoria RAM del navegador web. Nunca se envían a ningún servidor de terceros.
- **Persistencia en IndexedDB**: Las muestras, los polígonos de gating y las configuraciones se guardan localmente en el almacenamiento privado del navegador.
- **Generación de Reportes en el Cliente**: Los informes en PDF y las tablas en CSV se generan mediante `jspdf` directamente en el navegador del usuario.
- **Compatible con FCS 2.0, 3.0 y 3.1**: Admite archivos binarios de citómetros BD FACSCanto II, BD FACSLyric, Beckman Coulter CytoFLEX, Gallios, etc.
