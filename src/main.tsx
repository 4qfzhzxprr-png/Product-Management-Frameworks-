import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CaptureWindow } from "./ui/CaptureWindow";
import { App } from "./ui/App";
import "./ui/styles.css";

// The capture window loads the same page with #capture.
const isCapture = window.location.hash === "#capture";
if (isCapture) document.body.classList.add("capture-mode");

createRoot(document.getElementById("root")!).render(
  <StrictMode>{isCapture ? <CaptureWindow /> : <App />}</StrictMode>,
);
