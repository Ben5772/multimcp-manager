#!/bin/bash

echo "======================================"
echo "测试 SSH 连接和服务器删除功能"
echo "======================================"

BASE_URL="http://localhost:3457"

# 1. 创建测试服务器
echo ""
echo "1. 创建测试服务器..."
curl -s -X POST "${BASE_URL}/api/servers" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "test-ssh-delete",
    "port": 9999,
    "type": "supergateway",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-fetch"],
    "supergatewayArgs": {"outputTransport": "sse", "cors": true}
  }' | jq '.success'

# 2. 验证服务器已创建
echo ""
echo "2. 查看创建的服务器..."
curl -s "${BASE_URL}/api/servers" | jq '.[] | select(.name == "test-ssh-delete") | {name, port}'

# 3. 模拟 SSH 连接（需要实际配置）
echo ""
echo "3. 提示：请在浏览器中测试 SSH 连接功能"
echo "   - 打开 http://localhost:3457"
echo "   - 输入宿主机信息并连接"
echo "   - 然后尝试删除服务器"

# 4. 测试删除服务器
echo ""
echo "4. 测试删除服务器（不使用 SSH）..."
curl -s -X DELETE "${BASE_URL}/api/servers/test-ssh-delete" | jq '.success'

# 5. 验证删除结果
echo ""
echo "5. 验证服务器已删除..."
curl -s "${BASE_URL}/api/servers" | jq '[.[] | select(.name == "test-ssh-delete")] | length'

echo ""
echo "======================================"
echo "手动测试步骤:"
echo "======================================"
echo "1. 打开浏览器访问：http://localhost:3457"
echo "2. 页面加载时会弹出 SSH 连接对话框"
echo "3. 输入宿主机信息 (IP、用户名、密码) 并连接"
echo "4. 连接成功后，顶部会显示绿色状态 badge"
echo "5. 添加或选择一个服务器"
echo "6. 点击删除按钮，系统会通过 SSH 执行停止命令"
echo "7. 观察日志确认是否通过 SSH 执行了 kill 命令"
echo ""
echo "自动测试完成！请进行手动测试验证 SSH 功能。"
