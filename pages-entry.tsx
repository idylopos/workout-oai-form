import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WorkoutApp } from "./app/WorkoutApp";
import "./app/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("Application root is missing.");

createRoot(root).render(
  <StrictMode>
    <WorkoutApp />
  </StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Offline support is optional; the application remains usable online.
    });
  });
}

