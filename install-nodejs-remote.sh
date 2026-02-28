#!/bin/bash
# 在远程主机上安装 Node.js 并运行 OpenClaw MCP

echo "📦 正在安装 Node.js 20.x..."

# 下载并安装 NodeSource 仓库
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -

# 安装 Node.js
apt-get update && apt-get install -y nodejs

# 验证安装
echo ""
echo "✅ Node.js 安装完成！"
node --version
npm --version

echo ""
echo "🚀 正在启动 OpenClaw MCP..."

# 设置环境变量
export OPENCLAW_URL="http://127.0.0.1:18789"
export OPENCLAW_GATEWAY_TOKEN="your-gateway-token"
export AUTH_ENABLED="true"
export MCP_CLIENT_ID="openclaw"
export CORS_ORIGINS="https://claude.ai"

# 启动 OpenClaw MCP
cd /opt/multimcp-manager
nohup npx openclaw-mcp --transport sse --port 3000 > openclaw.log 2>&1 &

sleep 3

echo ""
echo "✅ OpenClaw MCP 已启动！"
echo "访问地址：http://localhost:3000/sse"
echo "日志文件：/opt/multimcp-manager/openclaw.log"
echo ""
echo "请刷新浏览器查看服务状态！"
