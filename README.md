# MultiMCP

一个功能完整的 MCP 服务器进程管理器，支持 supergateway 代理和直接命令执行。

## ✨ 功能特性

- ✅ **Web UI 管理界面** - 现代化的可视化操作界面
- ✅ **健康检查** - 自动检测 MCP 服务器响应（可配置检测间隔，默认 10 秒）
- ✅ **批量操作** - 批量启动/停止/重启多个服务器
- ✅ **配置模板** - 5 种预设 MCP 服务器模板 + 自定义模板管理
- ✅ **MaxKB 集成** - 一键生成 MaxKB MCP 配置 JSON
- ✅ **离线告警** - QQ 邮箱邮件通知，4 小时重复提醒
- ✅ **备份恢复** - 每小时自动备份，保留最近 24 个备份
- ✅ **端口管理** - 端口占用检测和自动分配
- ✅ **Linux 终端** - Web 界面直接执行系统命令
- ✅ **实时日志** - 查看每个服务器的运行日志
- ✅ **自动重启** - 进程异常退出后自动重启
- ✅ **systemd 服务** - 生产级进程管理，开机自启

## 🚀 快速开始

### 方法一：systemd 安装（推荐）

```bash
cd /root/multimcp-manager
sudo ./install.sh
```

安装完成后服务自动启动，访问 http://localhost:3457

### 方法二：手动运行

```bash
cd /root/multimcp-manager
npm install
node web-server.js
```

访问 http://localhost:3457

## 📋 CLI 使用

```bash
# 查看所有服务器状态
node manager.js status

# 启动服务器
node manager.js start fetch-server

# 停止服务器
node manager.js stop fetch-server

# 重启服务器
node manager.js restart fetch-server

# 查看日志
node manager.js logs fetch-server

# 创建备份
node manager.js backup

# 列出备份
node manager.js backups

# 恢复配置
node manager.js restore config-2026-02-27T10-06-01-454Z.json

# 查看端口使用
node manager.js ports
```

## 🔌 API 端点

### 服务器管理
```
GET  /api/servers              - 获取所有服务器状态
POST /api/servers/:name/start  - 启动单个服务器
POST /api/servers/:name/stop   - 停止单个服务器
POST /api/servers/:name/restart- 重启单个服务器
GET  /api/servers/:name/logs   - 获取服务器日志
GET  /api/servers/:name/health - 健康检查
POST /api/batch                - 批量操作
POST /api/start-all            - 启动所有启用的服务器
POST /api/stop-all             - 停止所有运行的服务器
```

### 模板管理
```
GET  /api/templates            - 获取配置模板
POST /api/templates            - 添加自定义模板
DELETE /api/templates/:key     - 删除模板
GET  /api/templates/export     - 导出模板
POST /api/templates/import     - 导入模板
POST /api/templates/:name/create- 从模板创建服务器
```

### 系统管理
```
GET  /api/ports                - 端口管理
GET  /api/backups              - 备份列表
POST /api/backups/create       - 创建备份
POST /api/backups/restore      - 恢复备份
POST /api/execute              - 执行系统命令
```

## 🎯 MaxKB 集成

在服务器卡片上点击 **"📄 MaxKB 配置"** 按钮，即可生成 MaxKB 支持的 MCP 配置 JSON：

```json
{
  "fetch-server": {
    "url": "http://localhost:9001/mcp",
    "transport": "streamable_http"
  }
}
```

支持一键复制和下载配置文件。

## 📝 配置文件

编辑 `/root/multimcp-manager/config.json`：

```json
{
  "servers": [
    {
      "name": "fetch-server",
      "enabled": true,
      "port": 9001,
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-fetch"],
      "supergatewayArgs": {
        "stdio": true,
        "outputTransport": "streamableHttp",
        "port": 9001,
        "cors": true
      },
      "healthCheck": {
        "enabled": true,
        "interval": 10000,
        "endpoint": "/mcp",
        "timeout": 5000
      }
    }
  ],
  "globalSettings": {
    "healthCheck": {
      "enabled": true,
      "defaultInterval": 10000
    },
    "email": {
      "enabled": false,
      "smtp": {
        "host": "smtp.qq.com",
        "port": 587,
        "secure": false,
        "auth": {
          "user": "your-qq@qq.com",
          "pass": "your-auth-code"
        }
      },
      "to": "your-qq@qq.com",
      "alertInterval": 14400000
    },
    "templates": {
      "filesystem": { ... },
      "github": { ... },
      "fetch": { ... },
      "postgres": { ... },
      "sqlite": { ... }
    }
  }
}
```

## 📧 邮件告警配置

在 Web 界面的「系统设置」→「邮件告警设置」中配置：

- SMTP 服务器：`smtp.qq.com`
- SMTP 端口：`587`
- 发件邮箱：你的 QQ 邮箱
- 授权码：QQ 邮箱的 SMTP 授权码
- 收件邮箱：接收告警的邮箱
- 告警间隔：默认 14400000 毫秒（4 小时）

## 🛠️ systemd 管理

```bash
# 启动
sudo systemctl start multimcp-manager

# 停止
sudo systemctl stop multimcp-manager

# 重启
sudo systemctl restart multimcp-manager

# 查看状态
sudo systemctl status multimcp-manager

# 查看日志
sudo journalctl -u multimcp-manager -f

# 开机自启
sudo systemctl enable multimcp-manager
```

## 📦 预设模板

内置 5 种常用 MCP 服务器模板：

1. **filesystem** - 文件系统访问
2. **github** - GitHub API 访问
3. **fetch** - HTTP 请求
4. **postgres** - PostgreSQL 数据库
5. **sqlite** - SQLite 数据库

支持自定义模板：添加、导出、导入、删除。

## 🔧 技术栈

- Node.js (ES Modules)
- Express.js
- Nodemailer
- node-cron
- CORS

## 📄 License

MIT

## 🔗 相关链接

- GitHub: https://github.com/Ben5772/multimcp-manager
- supergateway: https://github.com/modelcontextprotocol/supergateway
- MaxKB: https://github.com/1Panel-dev/MaxKB

---

<small>Includes [supergateway](https://github.com/modelcontextprotocol/supergateway) component licensed under MIT. Copyright (c) Model Context Protocol</small>
