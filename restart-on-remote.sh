#!/bin/bash
# 在远程主机上执行此脚本重启 Web 服务

echo "正在停止旧服务..."
pkill -f "node web-server.js" || true
sleep 2

echo "正在启动新服务..."
cd /opt/multimcp-manager
node web-server.js > web.log 2>&1 &
sleep 3

echo "检查服务状态..."
curl -s http://localhost:3457/api/servers | python3 -c "import sys,json; t=json.load(sys.stdin); print(f'✅ 服务已启动，服务器数量：{len(t)}')"

echo ""
echo "现在请刷新浏览器页面！"
