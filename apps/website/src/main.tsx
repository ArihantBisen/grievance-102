import React from "react";
import ReactDOM from "react-dom/client";
import "@sboss/design-tokens/src/tokens.css";
import "./styles.css";
import { App } from "./App";
import { PortalHeader } from "./components/PortalHeader";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PortalHeader />
    <App />
  </React.StrictMode>
);
