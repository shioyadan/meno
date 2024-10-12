// 
// 全体のエントリポイント
// 

import React from "react";
import { createRoot } from "react-dom/client";

// CSS ファイルを直接 import しているが，これは
// WEBPACK のローダーにより CSS ファイルを動的に読み込む JS に変換される
import "./styles.css";
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';

// App コンポーネント
import App from "./app";    

// index.html の div へ App をマウント
const container = document.getElementById("root");
const root = createRoot(container!);
root.render(<App />);

