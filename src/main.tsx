import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import './fonts/jetbrains-mono.css'
import '@xterm/xterm/css/xterm.css'
import { pdfjs } from 'react-pdf'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

// Detect dedicated GPU — enable GPU compositing if available
try {
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
  if (gl) {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : ''
    const isDiscreteGPU = /nvidia|radeon|geforce|rtx|gtx|amd|arc\s*a/i.test(renderer)
      && !/llvmpipe|swiftshader|softpipe/i.test(renderer)
    if (isDiscreteGPU) {
      document.documentElement.classList.add('gpu-accelerated')
    }
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
} catch {}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
