#!/bin/bash

echo "======================================"
echo "测试 SSH 配置保存和自动连接功能"
echo "======================================"

BASE_URL="http://localhost:3457"

# 1. 测试保存 SSH 配置
echo ""
echo "1. 测试保存 SSH 配置..."
curl -s -X POST "${BASE_URL}/api/ssh/connect" \
  -H "Content-Type: application/json" \
  -d '{
    "host": "localhost",
    "user": "root",
    "pass": "test123",
    "saveConfig": true
  }' | jq '.success'

# 2. 获取 SSH 配置
echo ""
echo "2. 获取保存的 SSH 配置..."
curl -s "${BASE_URL}/api/ssh/config" | jq '.'

# 3. 删除 SSH 配置
echo ""
echo "3. 删除 SSH 配置..."
curl -s -X DELETE "${BASE_URL}/api/ssh/config" | jq '.success'

# 4. 验证删除
echo ""
echo "4. 验证配置已删除..."
curl -s "${BASE_URL}/api/ssh/config" | jq '.sshConfig'

echo ""
echo "======================================"
echo "手动测试步骤:"
echo "======================================"
echo "1. 打开浏览器访问：http://localhost:3457"
echo "2. 页面加载时会自动弹出 SSH 连接对话框"
echo "3. 如果有保存的配置，会自动填充 IP 和用户名"
echo "4. 输入密码后点击'连接并保存'按钮"
echo "5. 刷新页面，配置应该还在"
echo "6. 命令终端应该自动连接到相同的宿主机"
echo ""
echo "配置模板批量删除测试:"
echo "1. 切换到'配置模板'标签"
echo "2. 点击'批量选择'按钮"
echo "3. 选择多个模板"
echo "4. 点击'批量删除'按钮"
echo "5. 确认删除"
echo ""
