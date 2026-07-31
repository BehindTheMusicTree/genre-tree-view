import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@behindthemusictree/genre-tree-view/styles.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
