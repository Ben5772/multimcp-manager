# OpenClaw MCP 部署模板

已添加三个 OpenClaw MCP Bridge 部署模板到配置管理中。

## 📦 模板列表

### 1. OpenClaw MCP (Docker) - 推荐 ⭐
**模板名称**: `openclaw-mcp-docker`

**特点**:
- Docker 容器化部署，最安全可靠
- 自动重启机制
- 只读文件系统 + 安全限制
- 自动处理依赖和环境

**使用步骤**:
1. 在 Web 界面选择此模板
2. 创建服务器实例
3. 自动执行 Docker 命令启动容器

**访问地址**: http://localhost:3000

---

### 2. OpenClaw MCP (NPX) - 本地开发
**模板名称**: `openclaw-mcp-npx`

**特点**:
- 快速本地部署
- 无需 Docker
- 适合开发测试

**环境变量**:
```bash
OPENCLAW_URL=http://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=your-gateway-token
AUTH_ENABLED=true
MCP_CLIENT_ID=openclaw
CORS_ORIGINS=https://claude.ai
```

**停止命令**: `pkill -f 'openclaw-mcp'`

---

### 3. OpenClaw MCP (Remote SSE) - 生产环境
**模板名称**: `openclaw-mcp-remote`

**特点**:
- 支持远程 HTTPS 访问
- OAuth 2.1 认证
- 适合 Claude.ai 集成

**环境变量**:
```bash
OPENCLAW_URL=http://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=your-gateway-token
AUTH_ENABLED=true
MCP_CLIENT_ID=openclaw
MCP_CLIENT_SECRET=your-secret-key-here
MCP_ISSUER_URL=https://mcp.your-domain.com
CORS_ORIGINS=https://claude.ai
```

**重要**: 
- 必须设置 `MCP_ISSUER_URL` 为公开 HTTPS URL
- 需要生成安全的 `MCP_CLIENT_SECRET`

---

## 🔧 使用方法

### 在 Web 界面中使用

1. **打开管理界面**
   ```
   http://localhost:3457
   ```

2. **切换到"配置模板"标签**

3. **选择 OpenClaw 模板**
   - Docker 部署 → `OpenClaw MCP (Docker)`
   - 本地测试 → `OpenClaw MCP (NPX)`
   - 远程部署 → `OpenClaw MCP (Remote SSE)`

4. **自定义配置（可选）**
   - 修改端口
   - 修改环境变量
   - 修改描述信息

5. **点击"从模板创建"**

6. **在服务器列表中启动服务**

---

## 🚀 Docker 部署详细步骤

### 前置要求
```bash
# 确保 Docker 已安装
docker --version

# 确保 OpenClaw Gateway 正在运行
curl http://localhost:18789/health
```

### 一键部署
```bash
# 通过管理界面创建后，会自动执行以下命令：
docker run -d \
  --name openclaw-mcp \
  --restart unless-stopped \
  -p 3000:3000 \
  -e OPENCLAW_URL=http://host.docker.internal:18789 \
  -e AUTH_ENABLED=true \
  -e MCP_CLIENT_ID=openclaw \
  -e CORS_ORIGINS=https://claude.ai \
  --add-host host.docker.internal:host-gateway \
  --read-only \
  --security-opt no-new-privileges \
  ghcr.io/freema/openclaw-mcp:latest
```

### 查看日志
```bash
docker logs -f openclaw-mcp
```

### 停止服务
```bash
docker stop openclaw-mcp && docker rm openclaw-mcp
```

---

## 🔐 安全建议

1. **始终启用认证**
   ```bash
   export AUTH_ENABLED=true
   ```

2. **生成安全密钥**
   ```bash
   export MCP_CLIENT_SECRET=$(openssl rand -hex 32)
   ```

3. **配置 CORS**
   ```bash
   export CORS_ORIGINS=https://claude.ai
   ```

4. **使用 HTTPS**
   - 生产环境必须使用反向代理（nginx/Caddy）
   - 设置正确的 `MCP_ISSUER_URL`

---

## 📝 Claude.ai 集成

### 添加 MCP 连接器

在 Claude.ai 中添加自定义 MCP 连接器：

```json
{
  "mcpServers": {
    "openclaw": {
      "url": "http://your-server:3000/sse",
      "headers": {
        "Authorization": "Bearer your-client-secret"
      }
    }
  }
}
```

**参数说明**:
- `url`: 你的 MCP 服务器地址
- `Authorization`: 使用 `MCP_CLIENT_SECRET`

---

## 🏗️ 架构说明

```
┌─────────────────────────────────────────┐
│         Your Server                     │
│                                         │
│  ┌──────────────┐  ┌─────────────────┐ │
│  │  OpenClaw    │  │  OpenClaw MCP   │ │
│  │  Gateway     │◄►│  Bridge         │ │
│  │  :18789      │  │  :3000          │ │
│  └──────────────┘  └────────┬────────┘ │
└─────────────────────────────┼───────────┘
                              │ HTTPS + OAuth 2.1
                              ▼
                     ┌─────────────────┐
                     │   Claude.ai     │
                     │   (MCP Client)  │
                     └─────────────────┘
```

---

## 🛠️ 故障排查

### 问题：Docker 容器无法启动
```bash
# 检查 Docker 日志
docker logs openclaw-mcp

# 检查端口占用
lsof -i:3000

# 重新创建容器
docker rm -f openclaw-mcp
```

### 问题：无法连接到 OpenClaw
```bash
# 检查 OpenClaw 是否运行
curl http://localhost:18789/health

# 检查 Docker 网络
docker exec openclaw-mcp curl http://host.docker.internal:18789/health
```

### 问题：OAuth 认证失败
```bash
# 确认 MCP_ISSUER_URL 设置正确
echo $MCP_ISSUER_URL

# 必须是公开 HTTPS URL
# 例如：https://mcp.your-domain.com
```

---

## 📚 相关资源

- [GitHub Repository](https://github.com/freema/openclaw-mcp)
- [Installation Guide](https://github.com/freema/openclaw-mcp/blob/main/docs/installation.md)
- [Configuration Guide](https://github.com/freema/openclaw-mcp/blob/main/docs/configuration.md)
- [Deployment Guide](https://github.com/freema/openclaw-mcp/blob/main/docs/deployment.md)

---

**最后更新**: 2026-02-28
**版本**: OpenClaw MCP v1.1.0
