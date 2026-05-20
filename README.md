# 异世旅社

双玩家异世界角色扮演生成器。一个前端给玩家A使用，一个 CLI 给玩家B使用；世界引擎负责生成场景、任务、隐藏行动判定、事件和结算记录。

## 特点

- 随机生成世界观、角色设定、主线任务、伏笔和事件节点
- 支持公开消息和隐藏消息，隐藏行为会按三层规则判定
- 玩家A 使用网页界面，玩家B 可以用 `cli.js` 进入同一局
- 提示词都放在 `server/prompts/`，可以直接编辑
- 本地保存会话和归档，便于结算后回看或进入度假模式

## 启动

```bash
npm install
npm start
```

网页入口默认是 [http://localhost:3460](http://localhost:3460)。

玩家B CLI 示例：

```bash
node cli.js list
node cli.js join <sessionId>
node cli.js say 我看看门牌上写了什么
node cli.js hide 趁没人注意，检查抽屉夹层
```

## MCP CLI 桥

如果要让 AI 通过 MCP 使用玩家B CLI，可以启动：

```bash
npm run mcp
```

使用时通常需要开两个进程：

```bash
# 进程1：启动游戏服务，给网页和 CLI 提供后端
npm start

# 进程2：启动 MCP CLI 桥，给 AI 客户端连接
npm run mcp
```

MCP 客户端配置示例：

```json
{
  "mcpServers": {
    "otherworld-inn-cli": {
      "command": "node",
      "args": ["D:/path/to/otherworld-inn/mcp-server.js"],
      "cwd": "D:/path/to/otherworld-inn"
    }
  }
}
```

这个 MCP server 只暴露两个工具：

- `output`：把一行文字原封不动传给 `cli.js`，例如 `look`、`list`、`join <sessionId>`、`say ...`、`hide ...`、`both 公开|隐藏`
- `input`：读取刚才 CLI 输出的文字，读完会清空未读缓冲

典型流程：

```text
output("list")
input()

output("join rp_xxxxx")
input()

output("look")
input()

output("say 我看看门牌上写了什么")
input()

output("hide 趁对方看门牌时，我检查抽屉夹层")
input()

output("both 我把手电筒照向走廊尽头|同时把刚才捡到的钥匙藏进袖口")
input()
```

注意：`output` 里不要写 `node cli.js` 前缀，只写原本 CLI 后面的那一行指令。MCP 不理解游戏规则，也不会拆分公开/隐藏内容；它只是把文字传给 CLI，再把 CLI 的文字输出交回给 AI。

## API 配置

不要把真实 API key 写进仓库。推荐用环境变量：

```bash
$env:DEEPSEEK_API_KEY="你的密钥"
npm start
```

也可以分别设置：

```bash
$env:DEEPSEEK_PRO_KEY="你的高质量模型密钥"
$env:DEEPSEEK_FLASH_KEY="你的快速模型密钥"
```

默认配置在 `server/config.example.json`。本地设置面板保存的配置会写入 `server/config.local.json`，这个文件已在 `.gitignore` 中忽略。

## 使用说明书

项目里的指引文件：

| 文件 | 给谁看 | 内容 |
|------|--------|------|
| `README.md` | 所有人 | 启动、配置、CLI、MCP |
| `AI操作清单.md` | AI玩家 | MCP/CLI 完整操作手册 |
| `功能地图.md` | 开发者 | 每个文件的作用和运行链路 |
| `给人类的说明书！.html` | 人类玩家 | 网页版玩法指南（也是 `public/guide.html`） |

### 需要配置什么

只需要配置 **API 密钥**，其他都是开箱即用：

- **环境变量方式**：设置 `DEEPSEEK_API_KEY`（或分别设置 `DEEPSEEK_PRO_KEY` 和 `DEEPSEEK_FLASH_KEY`）
- **配置文件方式**：复制 `server/config.example.json` 为 `server/config.local.json`，填入密钥

### 哪些东西可以自定义

| 想改什么 | 改哪个文件 | 说明 |
|---------|-----------|------|
| 世界观素材 | `server/prompts/world-pool.txt` | 加新的世界观类型或删掉不喜欢的 |
| 主题风格 | `server/prompts/theme-*.txt` | 每个主题一个文件，改叙事风格规则 |
| 隐藏行为判定规则 | `server/prompts/hidden-judge.txt` | 三层判定的逻辑 |
| 公屏回复规则 | `server/prompts/public-reply.txt` | 世界引擎怎么描写环境 |
| 世界生成规则 | `server/prompts/world-gen.txt` | 开局生成的完整系统提示词 |
| 玩家基础资料 | `server/prompts/player-base.json` | 玩家A/B的公开设定 |
| 游戏参数 | `server/config.example.json` | 关系概率、事件间隔、保底轮次等 |
| 端口号 | `server/config.example.json` → `游戏.端口` | 默认 3460 |

所有提示词都是纯文本，直接编辑即可，不需要改代码。

## 自定义玩家资料

默认玩家资料是去隐私化占位内容，位于 `server/prompts/player-base.json`。开局前可以把里面的玩家A、玩家B改成你愿意提供给世界生成器的公开设定。

## 目录

- `server/`：Express API、世界生成流程、会话管理
- `server/prompts/`：世界生成、回复、隐藏判定和主题提示词
- `public/`：网页前端
- `cli.js`：玩家B 的命令行入口

## 检查

```bash
npm test
```

这会对主要 JS 文件做语法检查。
