#!/bin/bash
# 自动启动 OpenClaw MCP 服务

echo "🚀 正在启动 OpenClaw MCP..."

# 检查是否已安装 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装，请先运行："
    echo "   bash /opt/multimcp-manager/install-nodejs-remote.sh"
    exit 1
fi

# 生成安全的 MCP_CLIENT_SECRET（如果未设置）
if [ -z "$MCP_CLIENT_SECRET" ]; then
    echo "🔐 正在生成 MCP_CLIENT_SECRET..."
    export MCP_CLIENT_SECRET=$(openssl rand -hex 32)
fi

# 设置环境变量
export OPENCLAW_URL="http://127.0.0.1:18789"
export OPENCLAW_GATEWAY_TOKEN="your-gateway-token"
export AUTH_ENABLED="true"
export MCP_CLIENT_ID="openclaw"
export CORS_ORIGINS="https://claude.ai"

# 停止旧进程
pkill -f "openclaw-mcp" 2>/dev/null || true
sleep 1

# 启动新进程
cd /opt/multimcp-manager
nohup npx openclaw-mcp --transport sse --port 3000 > openclaw.log 2>&1 &
OPENCLAW_PID=$!

echo "✅ OpenClaw MCP 已启动 (PID: $OPENCLAW_PID)"
echo ""
echo "📋 查看日志：tail -f /opt/multimcp-manager/openclaw.log"
echo "🔍 检查状态：curl http://localhost:3000/health"
echo "🛑 停止服务：pkill -f 'openclaw-mcp'"
echo ""

# 等待 3 秒并检查
sleep 3
if ps -p $OPENCLAW_PID > /dev/null; then
    echo "✨ 服务运行正常"
    echo ""
    echo "现在请刷新浏览器页面！"
else
    echo "❌ 服务启动失败，请查看日志："
    tail -20 /opt/multimcp-manager/openclaw.log
fi
