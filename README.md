# Supergateway Manager

一个功能完整的 MCP 服务器进程管理器，支持 supergateway 代理和直接命令执行。

## 功能特性

- ✅ **Web UI 管理界面** - 现代化的可视化操作界面
- ✅ **健康检查** - 自动检测 MCP 服务器响应（可配置检测间隔，默认 10 秒）
- ✅ **批量操作** - 批量启动/停止/重启多个服务器
- ✅ **配置模板** - 5 种预设 MCP 服务器模板（filesystem、github、fetch、postgres、sqlite）
- ✅ **离线告警** - QQ 邮箱邮件通知，4 小时重复提醒
- ✅ **备份恢复** - 每小时自动备份，保留最近 24 个备份
- ✅ **端口管理** - 端口占用检测和自动分配
- ✅ **Linux 终端** - Web 界面直接执行系统命令
- ✅ **实时日志** - 查看每个服务器的运行日志
- ✅ **自动重启** - 进程异常退出后自动重启

## 快速开始

### 安装依赖

```bash
cd /root/supergateway-manager
npm install
```

### 启动 Web 服务

```bash
node web-server.js
```

访问 http://localhost:3457

### CLI 使用

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

## API 端点

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
GET  /api/ports                - 端口管理
GET  /api/templates            - 获取配置模板
POST /api/templates/:name/create- 从模板创建服务器
GET  /api/backups              - 备份列表
POST /api/backups/create       - 创建备份
POST /api/backups/restore      - 恢复备份
POST /api/execute              - 执行系统命令
```

## 配置文件

编辑 `/root/supergateway-manager/config.json`：

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
    }
  }
}
```

## 邮件告警配置

在 Web 界面的「系统设置」→「邮件告警设置」中配置：

- SMTP 服务器：`smtp.qq.com`
- SMTP 端口：`587`
- 发件邮箱：你的 QQ 邮箱
- 授权码：QQ 邮箱的 SMTP 授权码
- 收件邮箱：接收告警的邮箱
- 告警间隔：默认 14400000 毫秒（4 小时）

## 技术栈

- Node.js (ES Modules)
- Express.js
- Nodemailer
- node-cron
- CORS

## License

MIT
