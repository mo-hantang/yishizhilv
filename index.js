/**
 * 异世旅社 · 服务器入口
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import rpApi from './routes/rp-api.js';
import { loadConfig } from './lib/rp-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '10mb' }));

// 静态文件（前端）
app.use(express.static(path.join(__dirname, '..', 'public')));

// API 路由
app.use('/api/rp', rpApi);

// 头像等资源
app.use('/assets', express.static(path.join(__dirname, '..')));

const config = loadConfig();
const PORT = config.游戏.端口 || 3460;

app.listen(PORT, () => {
  console.log(`异世旅社 → http://localhost:${PORT}`);
  console.log(`API → http://localhost:${PORT}/api/rp`);
});
