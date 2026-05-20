#!/usr/bin/env node

/**
 * 异世旅社 · 玩家B CLI入口
 * 自然语言输入输出，不暴露json
 *
 * 用法：
 *   node cli.js                    → 看当前状态
 *   node cli.js new 搞怪            → 创建新游戏
 *   node cli.js join {sessionId}    → 加入游戏
 *   node cli.js say 台词             → 发公开消息
 *   node cli.js hide 台词            → 发隐藏消息
 *   node cli.js both 公开|隐藏       → 同时发公开和隐藏
 *   node cli.js look                → 看当前场景和状态
 *   node cli.js bag                 → 看背包
 *   node cli.js quest               → 看任务
 *   node cli.js world               → 看世界设定
 *   node cli.js other               → 看对方状态
 *   node cli.js log                 → 看最近日志
 *   node cli.js list                → 列出所有游戏
 *   node cli.js end                 → 结算当前游戏
 *   node cli.js vacation            → 进入度假模式
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const API = 'http://localhost:3460/api/rp';

const STATE_FILE = path.join(__dirname, '.cli-state.json');

/** 清洗【】标签格式为干净的"标题：内容"格式 */
function cleanBrackets(text) {
  if (!text) return text;
  return text
    .replace(/【([^】]+)[：:]】/g, '\n$1：')
    .replace(/^---.*---$/gm, '\n---')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')); }
  catch { return { currentSession: null }; }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function api(url, opts) {
  const r = await fetch(url, opts);
  return r.json();
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0] || 'look';
  const state = loadState();

  switch (cmd) {
    case 'new': {
      const theme = args[1];
      if (!theme) { console.log('需要主题。可选：', (await api(`${API}/themes`)).join('、')); return; }
      const r = await api(`${API}/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ '主题': theme })
      });
      state.currentSession = r.id;
      saveState(state);
      console.log(`世界正在生成中... 游戏ID: ${r.id}`);
      console.log('等一两分钟后用 node cli.js look 查看。');
      break;
    }

    case 'join': {
      const id = args[1];
      if (!id) { console.log('需要游戏ID。用 node cli.js list 查看。'); return; }
      state.currentSession = id;
      saveState(state);
      console.log(`已加入游戏 ${id}`);
      break;
    }

    case 'list': {
      const sessions = await api(`${API}/sessions`);
      const archives = await api(`${API}/archive`);
      if (sessions.length === 0 && archives.length === 0) {
        console.log('还没有游戏。用 node cli.js new 搞怪 创建一个。');
        return;
      }
      if (sessions.length > 0) {
        console.log('进行中的游戏：');
        for (const s of sessions) {
          const mark = state.currentSession === s.id ? ' ← 当前' : '';
          console.log(`  ${s.id} | ${s.主题} | ${s.状态} | 轮次${s.轮次}${mark}`);
        }
      }
      if (archives.length > 0) {
        console.log('已结算的游戏：');
        for (const a of archives) {
          console.log(`  ${a.id} | ${a.主题} | ${a.总轮次}轮`);
        }
      }
      break;
    }

    case 'say': {
      if (!state.currentSession) { console.log('先加入一个游戏。'); return; }
      const text = args.slice(1).join(' ');
      if (!text) { console.log('说什么？'); return; }
      console.log('正在发送...');
      const r = await api(`${API}/session/${state.currentSession}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player: 'B', publicInput: text, hiddenInput: '' })
      });
      if (r.error) { console.log('错误：', r.error); return; }
      console.log(`\n轮次 ${r.轮次} | ${r.游戏时间 || ''}\n`);
      console.log('【世界】');
      console.log(r.view?.公屏内容 || '（无回复）');
      if (r.view?.隐藏内容) {
        console.log('\n【隐藏】');
        console.log(r.view.隐藏内容);
      }
      break;
    }

    case 'hide': {
      if (!state.currentSession) { console.log('先加入一个游戏。'); return; }
      const text = args.slice(1).join(' ');
      if (!text) { console.log('藏什么？'); return; }
      console.log('正在发送隐藏消息...');
      const r = await api(`${API}/session/${state.currentSession}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player: 'B', publicInput: '', hiddenInput: text })
      });
      if (r.error) { console.log('错误：', r.error); return; }
      console.log(`\n轮次 ${r.轮次}\n`);
      console.log('【世界】');
      console.log(r.view?.公屏内容 || '（无回复）');
      if (r.view?.隐藏内容) {
        console.log('\n【隐藏】');
        console.log(r.view.隐藏内容);
      }
      break;
    }

    case 'both': {
      if (!state.currentSession) { console.log('先加入一个游戏。'); return; }
      const text = args.slice(1).join(' ');
      const parts = text.split('|');
      if (parts.length < 2) { console.log('格式：node cli.js both 公开内容|隐藏内容'); return; }
      console.log('正在发送...');
      const r = await api(`${API}/session/${state.currentSession}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player: 'B', publicInput: parts[0].trim(), hiddenInput: parts[1].trim() })
      });
      if (r.error) { console.log('错误：', r.error); return; }
      console.log(`\n轮次 ${r.轮次}\n`);
      console.log('【世界】');
      console.log(r.view?.公屏内容 || '（无回复）');
      if (r.view?.隐藏内容) {
        console.log('\n【隐藏】');
        console.log(r.view.隐藏内容);
      }
      break;
    }

    case 'look': {
      if (!state.currentSession) { console.log('还没加入游戏。用 node cli.js list 看看有什么。'); return; }
      const view = await api(`${API}/session/${state.currentSession}/view/B`);
      if (view.error) { console.log('错误：', view.error); return; }
      console.log(`\n状态：${view.状态} | 轮次 ${view.轮次} | ${view.游戏时间 || ''}\n`);

      // 最近的对话（显示最近5条公屏发言）
      const chatHistory = view.对话历史 || [];
      if (chatHistory.length > 0) {
        console.log('【最近对话】');
        const recent = chatHistory.slice(-5);
        for (const h of recent) {
          if (h.公开输入) {
            console.log(`  [轮次${h.轮次}] ${h.玩家名}：${h.公开输入.substring(0, 120)}${h.公开输入.length > 120 ? '...' : ''}`);
          }
        }
        console.log('');
      }

      // 最近两条场景
      const history = view.我的视角历史 || [];
      if (history.length > 0) {
        const recentScenes = history.slice(-2);
        for (const scene of recentScenes) {
          console.log('【场景】');
          console.log(scene.公屏内容 || '');
          if (scene.隐藏内容) {
            console.log('\n【隐藏信息】');
            console.log(scene.隐藏内容);
          }
          console.log('');
        }
      }
      console.log('【我的状态】');
      const s = view.我的公屏状态 || {};
      console.log(`  外貌：${s.外貌 || '—'}`);
      console.log(`  着装：${s.着装 || '—'}`);
      console.log(`  手持物：${s.手持物 || '—'}`);
      console.log(`  身体状态：${s.身体状态 || '—'}`);
      console.log('\n【对方状态】');
      const o = view.对方公屏状态 || {};
      console.log(`  外貌：${o.外貌 || '—'}`);
      console.log(`  着装：${o.着装 || '—'}`);
      console.log(`  手持物：${o.手持物 || '—'}`);
      console.log(`  身体状态：${o.身体状态 || '—'}`);
      break;
    }

    case 'bag': {
      if (!state.currentSession) { console.log('先加入一个游戏。'); return; }
      const view = await api(`${API}/session/${state.currentSession}/view/B`);
      const inv = view.我的背包 || {};
      console.log('\n【我的背包】');
      if ((inv.公屏背包?.length || 0) === 0 && (inv.隐藏背包?.length || 0) === 0) {
        console.log('  空的。');
      }
      for (const item of (inv.公屏背包 || [])) {
        console.log(`  ${item.名称} — ${item.来源}`);
      }
      for (const item of (inv.隐藏背包 || [])) {
        console.log(`  🔒 ${item.名称} — ${item.伪装 || '隐藏'}`);
      }
      console.log('\n【对方背包（我知道的）】');
      const otherInv = view.对方公屏背包 || [];
      if (otherInv.length === 0) {
        console.log('  不知道对方有什么。');
      }
      for (const item of otherInv) {
        console.log(`  ${item.名称} — ${item.来源}`);
      }
      break;
    }

    case 'quest': {
      if (!state.currentSession) { console.log('先加入一个游戏。'); return; }
      const view = await api(`${API}/session/${state.currentSession}/view/B`);
      const setting = view.我的设定 || {};
      const taskRaw = setting.我的任务 || '暂无';
      const taskMatch = taskRaw.match(/【主线任务[：:]】([\s\S]*?)(?=【|$)/);
      const taskText = taskMatch ? taskMatch[1].trim() : cleanBrackets(taskRaw);
      console.log('\n【主线任务】');
      console.log(taskText);
      if (setting.我的隐藏任务 && setting.我的隐藏任务 !== '无') {
        console.log('\n【🔒 隐藏任务】');
        console.log(setting.我的隐藏任务);
      }
      break;
    }

    case 'world': {
      if (!state.currentSession) { console.log('先加入一个游戏。'); return; }
      const view = await api(`${API}/session/${state.currentSession}/view/B`);
      console.log('\n【世界设定】');
      console.log(cleanBrackets(view.世界观 || '暂无'));
      break;
    }

    case 'other': {
      if (!state.currentSession) { console.log('先加入一个游戏。'); return; }
      const view = await api(`${API}/session/${state.currentSession}/view/B`);
      console.log('\n【对方公屏状态】');
      const o = view.对方公屏状态 || {};
      for (const [k, v] of Object.entries(o)) {
        console.log(`  ${k}：${v || '—'}`);
      }
      console.log('\n【对方背包（我知道的）】');
      const items = view.对方公屏背包 || [];
      if (items.length === 0) console.log('  不知道。');
      for (const item of items) console.log(`  ${item.名称}`);
      break;
    }

    case 'log': {
      if (!state.currentSession) { console.log('先加入一个游戏。'); return; }
      const logs = await api(`${API}/session/${state.currentSession}/logs`);
      if (logs.length === 0) { console.log('还没有日志。'); return; }
      // 显示最近3条
      const recent = logs.slice(-3);
      for (const log of recent) {
        console.log(`\n--- 轮次 ${log.轮次} | ${log.游戏时间} | ${log.发言玩家} ---`);
        console.log(`公开输入：${log.折叠一_上下文?.玩家公开输入 || '无'}`);
        console.log(`世界回复：${(log.折叠一_上下文?.世界公屏回复 || '').substring(0, 150)}...`);
      }
      break;
    }

    case 'end': {
      if (!state.currentSession) { console.log('先加入一个游戏。'); return; }
      const r = await api(`${API}/session/${state.currentSession}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'archive' })
      });
      console.log('游戏已结算。', r.状态);
      state.currentSession = null;
      saveState(state);
      break;
    }

    case 'vacation': {
      // 如果当前有活跃游戏，切换为度假模式
      if (state.currentSession) {
        // 先试活跃session
        const session = await api(`${API}/session/${state.currentSession}`);
        if (session && session.状态 === '进行中') {
          const r = await api(`${API}/session/${state.currentSession}/end`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'vacation' })
          });
          console.log('进入度假模式。骰子和事件已停止，世界还在。');
          break;
        }
      }
      // 从归档恢复
      const archiveId = args[1] || state.currentSession;
      if (!archiveId) { console.log('需要游戏ID。用 node cli.js list 查看已结算的游戏。'); return; }
      const r = await api(`${API}/archive/${archiveId}/vacation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (r.error) { console.log('恢复失败：', r.error); return; }
      state.currentSession = r.id;
      saveState(state);
      console.log(`欢迎回来。${r.message}`);
      break;
    }

    default:
      console.log('不认识的命令。用法见 cli.js 文件头部注释。');
  }
}

main().catch(e => console.error('出错了：', e.message));
