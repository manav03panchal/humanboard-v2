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

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
