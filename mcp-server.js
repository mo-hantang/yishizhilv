#!/usr/bin/env node

/**
 * MCP-to-CLI bridge for the AI player.
 *
 * This server intentionally exposes only two tools:
 * - output: pass one line of CLI text to cli.js
 * - input: read the latest CLI output captured by this bridge
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLI_PATH = path.join(__dirname, 'cli.js');

const SERVER_INFO = {
  name: 'otherworld-inn-cli-bridge',
  version: '1.0.0'
};

let nextOutput = '';
let transcript = '';

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function result(id, payload = {}) {
  send({ jsonrpc: '2.0', id, result: payload });
}

function error(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

function textResult(text) {
  return {
    content: [{ type: 'text', text }]
  };
}

function splitCliText(text) {
  const input = String(text ?? '').replace(/\r?\n/g, ' ').trim();
  if (!input) throw new Error('output 需要一行 CLI 指令，例如：look、list、say 你好、hide 我检查抽屉。');

  const match = input.match(/^(\S+)(?:\s+([\s\S]*))?$/);
  const command = match?.[1] || '';
  const rest = (match?.[2] || '').trim();

  return rest ? [command, rest] : [command];
}

function runCli(rawText) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const args = splitCliText(rawText);
    const child = spawn(process.execPath, [CLI_PATH, ...args], {
      cwd: __dirname,
      shell: false,
      windowsHide: true,
      env: process.env
    });

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      resolve({
        code: null,
        command: rawText,
        stdout,
        stderr: `${stderr}\n[MCP bridge] CLI command timed out.`.trim()
      });
    }, 120000);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', err => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ code: null, command: rawText, stdout, stderr: `${stderr}\n${err.message}`.trim() });
    });
    child.on('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ code, command: rawText, stdout, stderr });
    });
  });
}

function formatCliRun(run) {
  const parts = [
    `$ node cli.js ${run.command}`,
    run.stdout.trim(),
    run.stderr.trim() ? `\n[stderr]\n${run.stderr.trim()}` : '',
    run.code === 0 ? '' : `\n[exit ${run.code ?? 'unknown'}]`
  ].filter(Boolean);
  return parts.join('\n');
}

async function callTool(name, args = {}) {
  if (name === 'output') {
    const text = args.text;
    const run = await runCli(text);
    const formatted = formatCliRun(run);
    nextOutput = nextOutput ? `${nextOutput}\n\n${formatted}` : formatted;
    transcript = transcript ? `${transcript}\n\n${formatted}` : formatted;
    return textResult(`已发送到 CLI：${String(text ?? '').trim()}\n调用 input 读取 CLI 输出。`);
  }

  if (name === 'input') {
    const text = nextOutput || '还没有新的 CLI 输出。可以先调用 output，发送例如：look、list、say 你好、hide 我检查抽屉。';
    nextOutput = '';
    return textResult(text);
  }

  throw new Error(`Unknown tool: ${name}`);
}

function listTools() {
  return {
    tools: [
      {
        name: 'output',
        description: '把一行文字原封不动作为 AI 玩家 CLI 指令发送给游戏。例如：look、list、join <id>、say ...、hide ...、both 公开|隐藏。',
        inputSchema: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: '要传给 cli.js 的单行指令，不包含 "node cli.js" 前缀。'
            }
          },
          required: ['text'],
          additionalProperties: false
        }
      },
      {
        name: 'input',
        description: '读取 MCP bridge 捕获到的最新 CLI 输出，并把这些文字传给 AI。读取后会清空未读缓冲。',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false
        }
      }
    ]
  };
}

async function handle(message) {
  const { id, method, params = {} } = message;

  if (method === 'initialize') {
    result(id, {
      protocolVersion: params.protocolVersion || '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO
    });
    return;
  }

  if (method === 'notifications/initialized') return;
  if (method === 'ping') return result(id, {});
  if (method === 'tools/list') return result(id, listTools());
  if (method === 'resources/list') return result(id, { resources: [] });
  if (method === 'prompts/list') return result(id, { prompts: [] });

  if (method === 'tools/call') {
    try {
      const payload = await callTool(params.name, params.arguments || {});
      result(id, payload);
    } catch (err) {
      error(id, -32000, err.message);
    }
    return;
  }

  if (id !== undefined) error(id, -32601, `Method not found: ${method}`);
}

let buffer = '';
let queue = Promise.resolve();
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buffer += chunk;
  let newlineIndex;
  while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, newlineIndex).trim();
    buffer = buffer.slice(newlineIndex + 1);
    if (!line) continue;
    try {
      const message = JSON.parse(line);
      queue = queue.then(() => handle(message)).catch(err => {
        process.stderr.write(`[MCP bridge] ${err.stack || err.message}\n`);
      });
    } catch (err) {
      error(null, -32700, `Parse error: ${err.message}`);
    }
  }
});

process.stdin.on('end', () => {
  if (transcript) process.stderr.write('[MCP bridge] stdin closed.\n');
});
