import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { ServicesContext } from "./app/context";
import { createServices } from "./app/services";
import "./shared/styles/legacy.css";
const root = document.getElementById("root");
if (!root) throw new Error("Application root is missing");
const services = createServices();
createRoot(root).render(
  <StrictMode>
    <ServicesContext value={services}>
      <App />
    </ServicesContext>
  </StrictMode>,
);
