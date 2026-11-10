import React from "react";
import ReactDOM from "react-dom/client";
import "../index.css";
import { ToastProvider } from "../lib/toast";
import { AdminApp } from "./AdminApp";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ToastProvider>
      <AdminApp />
    </ToastProvider>
  </React.StrictMode>
);
