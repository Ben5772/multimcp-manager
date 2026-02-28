# OpenClaw MCP 部署指南 - MultiMCP Manager

## 📋 概述

本文档介绍如何通过 MultiMCP Manager 快速部署和配置 OpenClaw MCP Bridge Server。

---

## 🎯 三种部署方式

### 1. Docker 部署（推荐）⭐
**适用场景**: 生产环境、需要自动重启和安全隔离

**模板名称**: `OpenClaw MCP (Docker)`

**优势**:
- ✅ 自动生成安全的 `MCP_CLIENT_SECRET`
- ✅ 容器化隔离，安全性高
- ✅ 自动重启机制
- ✅ 只读文件系统 + 安全限制
- ✅ 无需安装 Node.js

**配置参数**:
```bash
镜像：ghcr.io/freema/openclaw-mcp:latest
端口：3000:3000
环境变量:
  - OPENCLAW_URL=http://host.docker.internal:18789
  - AUTH_ENABLED=true
  - MCP_CLIENT_ID=openclaw
  - MCP_CLIENT_SECRET=$(openssl rand -hex 32)  # 自动生成
  - CORS_ORIGINS=https://claude.ai
```

---

### 2. NPX 本地部署
**适用场景**: 开发测试、快速验证

**模板名称**: `OpenClaw MCP (NPX)`

**配置参数**:
```bash
命令：npx openclaw-mcp --transport sse --port 3000
端口：3000
环境变量:
  - OPENCLAW_URL=http://127.0.0.1:18789
  - OPENCLAW_GATEWAY_TOKEN=your-gateway-token
  - AUTH_ENABLED=true
  - MCP_CLIENT_ID=openclaw
  - MCP_CLIENT_SECRET=auto-generated-at-runtime
  - CORS_ORIGINS=https://claude.ai
```

---

### 3. Remote SSE 远程部署
**适用场景**: Claude.ai 生产集成、需要 HTTPS 反向代理

**模板名称**: `OpenClaw MCP (Remote SSE)`

**配置参数**:
```bash
命令：npx openclaw-mcp --transport sse --port 3000 --issuer-url https://mcp.your-domain.com
端口：3000
环境变量:
  - OPENCLAW_URL=http://127.0.0.1:18789
  - OPENCLAW_GATEWAY_TOKEN=your-gateway-token
  - AUTH_ENABLED=true
  - MCP_CLIENT_ID=openclaw
  - MCP_CLIENT_SECRET=REPLACE_WITH_SECURE_SECRET  # 必须手动生成
  - MCP_ISSUER_URL=https://mcp.your-domain.com
  - CORS_ORIGINS=https://claude.ai
```

**重要**: 
- ⚠️ 必须设置 `MCP_ISSUER_URL` 为公开 HTTPS URL
- ⚠️ 必须手动生成至少 32 字符的 `MCP_CLIENT_SECRET`

---

## 🚀 快速开始

### 方法一：通过 Web 界面（推荐）

#### 步骤 1: 访问管理界面
```
http://localhost:3457
```

#### 步骤 2: 选择部署方式
1. 切换到 **"配置模板"** 标签
2. 选择合适的 OpenClaw MCP 模板
   - Docker 部署 → `OpenClaw MCP (Docker)`
   - 本地测试 → `OpenClaw MCP (NPX)`
   - 远程部署 → `OpenClaw MCP (Remote SSE)`

#### 步骤 3: 自定义配置（可选）
- 修改端口（避免冲突）
- 修改环境变量
- 修改描述信息

#### 步骤 4: 创建并启动
1. 点击 **"从模板创建"**
2. 在服务器列表中找到新创建的服务器
3. 点击 **"启动"** 按钮

---

### 方法二：命令行部署

#### Docker 部署
```bash
# 一键启动
docker run -d \
  --name openclaw-mcp \
  --restart unless-stopped \
  -p 3000:3000 \
  -e OPENCLAW_URL=http://host.docker.internal:18789 \
  -e AUTH_ENABLED=true \
  -e MCP_CLIENT_ID=openclaw \
  -e MCP_CLIENT_SECRET=$(openssl rand -hex 32) \
  -e CORS_ORIGINS=https://claude.ai \
  --add-host host.docker.internal:host-gateway \
  --read-only \
  --security-opt no-new-privileges \
  ghcr.io/freema/openclaw-mcp:latest

# 查看状态
docker logs -f openclaw-mcp

# 健康检查
curl http://localhost:3000/health
```

#### NPX 本地部署
```bash
# 自动生成密钥并启动
export MCP_CLIENT_SECRET=$(openssl rand -hex 32)
export OPENCLAW_URL="http://127.0.0.1:18789"
export OPENCLAW_GATEWAY_TOKEN="your-gateway-token"
export AUTH_ENABLED="true"
export MCP_CLIENT_ID="openclaw"
export CORS_ORIGINS="https://claude.ai"

cd /opt/multimcp-manager
nohup npx openclaw-mcp --transport sse --port 3000 > openclaw.log 2>&1 &

# 查看日志
tail -f openclaw.log

# 健康检查
curl http://localhost:3000/health
```

---

## 🔧 故障排查

### 问题 1: MCP_CLIENT_SECRET 长度不足

**错误信息**:
```
ERROR: MCP_CLIENT_SECRET must be at least 32 characters
```

**解决方案**:
```bash
# 生成安全密钥
export MCP_CLIENT_SECRET=$(openssl rand -hex 32)

# 验证长度
echo $MCP_CLIENT_SECRET | wc -c  # 应该输出 65 (64 字符 + 换行)

# 重新启动服务
npx openclaw-mcp --transport sse --port 3000
```

---

### 问题 2: 找不到 npx 命令

**错误信息**:
```
bash: line 1: npx: command not found
```

**解决方案**:
```bash
# 安装 Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get update && apt-get install -y nodejs

# 验证安装
node --version
npm --version

# 重新启动服务
npx openclaw-mcp --transport sse --port 3000
```

---

### 问题 3: 端口被占用

**错误信息**:
```
Error: listen EADDRINUSE: address already in use :::3000
```

**解决方案**:
```bash
# 查找占用端口的进程
lsof -ti:3000 | xargs kill -9

# 或者修改服务端口
export PORT=3001
npx openclaw-mcp --transport sse --port 3001
```

---

### 问题 4: 无法连接到 OpenClaw Gateway

**错误信息**:
```
Failed to connect to OpenClaw Gateway
```

**解决方案**:
```bash
# 检查 OpenClaw 是否运行
curl http://localhost:18789/health

# 检查配置文件
cat openclaw.json | grep -A5 "http"

# 确保 HTTP API 已启用
# openclaw.json 应包含:
{
  "gateway": {
    "http": {
      "endpoints": {
        "chatCompletions": {
          "enabled": true
        }
      }
    }
  }
}
```

---

### 问题 5: OAuth 认证失败（Remote 模式）

**错误信息**:
```
OAuth metadata URL is not valid
```

**解决方案**:
```bash
# 确保设置了正确的 ISSUER_URL
export MCP_ISSUER_URL="https://mcp.your-domain.com"

# 必须以 https:// 开头
# 不能是 localhost 或 http://（生产环境）

# 重新启动
npx openclaw-mcp --transport sse --port 3000 --issuer-url $MCP_ISSUER_URL
```

---

## 🛠️ 调试技巧

### 1. 查看详细日志
```bash
# 实时查看日志
tail -f /opt/multimcp-manager/openclaw.log

# 查看最近 100 行
tail -100 /opt/multimcp-manager/openclaw.log

# 搜索错误
grep -i error /opt/multimcp-manager/openclaw.log
```

### 2. 检查服务状态
```bash
# 查看进程
ps aux | grep openclaw-mcp

# 查看端口监听
netstat -tlnp | grep 3000

# 健康检查
curl -v http://localhost:3000/health
```

### 3. 测试 API 端点
```bash
# 健康检查
curl http://localhost:3000/health

# SSE 端点（会保持连接）
curl -N http://localhost:3000/sse

# 列出所有 MCP 工具
curl http://localhost:3000/api/tools
```

### 4. 网络抓包（高级）
```bash
# 安装 tcpdump
apt-get install -y tcpdump

# 抓取 3000 端口的流量
tcpdump -i any -s 0 -w openclaw.pcap port 3000

# 用 Wireshark 分析
wireshark openclaw.pcap
```

---

## 📊 架构说明

```
┌─────────────────────────────────────────┐
│         Your Server                     │
│                                         │
│  ┌──────────────┐  ┌─────────────────┐ │
│  │  OpenClaw    │  │  OpenClaw MCP   │ │
│  │  Gateway     │◄►│  Bridge         │ │
│  │  :18789      │  │  :3000          │ │
│  │              │  │                 │ │
│  │  OpenAI-compat│  │  - OAuth 2.1    │ │
│  │  /v1/chat/...│  │  - CORS protect │ │
│  └──────────────┘  │  - Input valid  │ │
│                    └────────┬────────┘ │
└─────────────────────────────┼───────────┘
                              │ HTTPS + OAuth 2.1
                              ▼
                     ┌─────────────────┐
                     │   Claude.ai     │
                     │   (MCP Client)  │
                     └─────────────────┘
```

---

## 🔐 安全建议

### 1. 始终启用认证
```bash
export AUTH_ENABLED=true
```

### 2. 生成强随机密钥
```bash
# 使用 OpenSSL 生成 64 字符密钥
export MCP_CLIENT_SECRET=$(openssl rand -hex 32)

# 或使用 /dev/urandom
export MCP_CLIENT_SECRET=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
```

### 3. 配置 CORS
```bash
# 仅允许特定来源
export CORS_ORIGINS="https://claude.ai,https://your-app.com"

# 不要使用通配符 *
```

### 4. 使用 HTTPS（生产环境）
```bash
# Caddy 配置示例
mcp.your-domain.com {
    reverse_proxy localhost:3000
}

# nginx 配置示例
server {
    listen 443 ssl;
    server_name mcp.your-domain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## 📚 相关资源

- [GitHub Repository](https://github.com/freema/openclaw-mcp)
- [Installation Guide](https://github.com/freema/openclaw-mcp/blob/main/docs/installation.md)
- [Configuration Guide](https://github.com/freema/openclaw-mcp/blob/main/docs/configuration.md)
- [Deployment Guide](https://github.com/freema/openclaw-mcp/blob/main/docs/deployment.md)
- [Security Guide](https://github.com/freema/openclaw-mcp/blob/main/docs/security.md)

---

## 💡 常见问题

### Q: 可以同时在多个端口运行吗？
**A**: 可以，只需设置不同的端口和环境变量：
```bash
# 实例 1
PORT=3000 MCP_CLIENT_ID=openclaw-1 npx openclaw-mcp ...

# 实例 2
PORT=3001 MCP_CLIENT_ID=openclaw-2 npx openclaw-mcp ...
```

### Q: 如何停止服务？
**A**: 
```bash
# NPX 方式
pkill -f 'openclaw-mcp'

# Docker 方式
docker stop openclaw-mcp && docker rm openclaw-mcp
```

### Q: 如何更新版本？
**A**:
```bash
# Docker
docker pull ghcr.io/freema/openclaw-mcp:latest
docker restart openclaw-mcp

# NPX
npx openclaw-mcp@latest --transport sse --port 3000
```

### Q: 日志文件在哪里？
**A**:
```bash
# NPX 方式
/opt/multimcp-manager/openclaw.log

# Docker 方式
docker logs openclaw-mcp
```

---

**最后更新**: 2026-02-28  
**版本**: OpenClaw MCP v1.0.0  
**MultiMCP Manager**: v1.0.0
