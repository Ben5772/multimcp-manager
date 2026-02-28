#!/bin/bash
# 修复 OpenClaw MCP 启动问题 - 自动生成 MCP_CLIENT_SECRET

echo "🔧 正在修复 OpenClaw MCP 启动..."

# 1. 停止旧的进程
echo "🛑 停止旧进程..."
pkill -f "openclaw-mcp" 2>/dev/null || true
sleep 1

# 2. 生成安全的密钥
echo "🔐 生成 MCP_CLIENT_SECRET..."
export MCP_CLIENT_SECRET=$(openssl rand -hex 32)
echo "✅ 已生成密钥（前 8 位）: ${MCP_CLIENT_SECRET:0:8}..."

# 3. 设置所有环境变量
export OPENCLAW_URL="http://127.0.0.1:18789"
export OPENCLAW_GATEWAY_TOKEN="your-gateway-token"
export AUTH_ENABLED="true"
export MCP_CLIENT_ID="openclaw"
export CORS_ORIGINS="https://claude.ai"

# 4. 启动服务
echo ""
echo "🚀 启动 OpenClaw MCP..."
cd /opt/multimcp-manager
nohup npx openclaw-mcp --transport sse --port 3000 > openclaw.log 2>&1 &
OPENCLAW_PID=$!

echo "✅ OpenClaw MCP 已启动 (PID: $OPENCLAW_PID)"
echo ""

# 5. 等待并验证
sleep 5
if ps -p $OPENCLAW_PID > /dev/null; then
    echo "✨ 服务运行正常！"
    echo ""
    echo "📊 快速检查:"
    echo "   curl http://localhost:3000/health"
    echo ""
    echo "📋 查看实时日志:"
    echo "   tail -f /opt/multimcp-manager/openclaw.log"
    echo ""
    echo "🎉 现在请刷新浏览器页面！"
else
    echo "❌ 服务启动失败，查看最近日志:"
    echo ""
    tail -30 /opt/multimcp-manager/openclaw.log
fi
