import React from "react";
import ReactDOM from "react-dom/client";
import "../index.css";
import { setTransport } from "../lib/api";
import { ToastProvider } from "../lib/toast";
import { link } from "./link";
import { MobileRoot } from "./MobileApp";

// Every backend command from the phone screens goes to the shop PC.
setTransport((cmd, args) => link.rpc(cmd, args));

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ToastProvider>
      <MobileRoot />
    </ToastProvider>
  </React.StrictMode>
);
