// Copyright (c) 2026 zuming58. Personal noncommercial use only; see ../LICENSE.
// Third-party dependencies retain their own licenses.
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./styles.css";
import { restoreBeforeMount } from './store/restoreHandover.js';

restoreBeforeMount().then(() => createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)).catch(() => { document.getElementById('root').textContent = '恢复数据交接未完成，原副本已保留。请检查可用空间后重新启动 DeskMate。'; });
