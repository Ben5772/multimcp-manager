#!/bin/bash

# 测试模板批量操作和添加功能

BASE_URL="http://localhost:3457"

echo "======================================"
echo "测试模板管理功能"
echo "======================================"

# 1. 测试添加新模板 (Supergateway 类型)
echo ""
echo "1. 添加 Supergateway 类型模板..."
curl -s -X POST "${BASE_URL}/api/templates" \
  -H "Content-Type: application/json" \
  -d '{
    "templates": {
      "test-sg-template": {
        "templateType": "supergateway",
        "name": "测试 SG 模板",
        "description": "这是一个测试的 Supergateway 模板",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-fetch"],
        "env": {},
        "supergatewayArgs": {"outputTransport": "sse", "cors": true}
      }
    }
  }' | jq '.success'

# 2. 测试添加新模板 (自定义类型)
echo ""
echo "2. 添加自定义类型模板..."
curl -s -X POST "${BASE_URL}/api/templates" \
  -H "Content-Type: application/json" \
  -d '{
    "templates": {
      "test-custom-template": {
        "templateType": "custom",
        "name": "测试自定义模板",
        "description": "这是一个测试的自定义模板",
        "startCommand": "./start.sh",
        "stopCommand": "./stop.sh",
        "port": 9999,
        "env": {"TEST": "value"}
      }
    }
  }' | jq '.success'

# 3. 验证模板已添加
echo ""
echo "3. 获取所有模板..."
curl -s "${BASE_URL}/api/templates" | jq '.templates | keys'

# 4. 测试批量删除模板
echo ""
echo "4. 批量删除测试模板..."
curl -s -X DELETE "${BASE_URL}/api/templates/test-sg-template" | jq '.success'
curl -s -X DELETE "${BASE_URL}/api/templates/test-custom-template" | jq '.success'

# 5. 验证删除结果
echo ""
echo "5. 验证删除后的模板列表..."
curl -s "${BASE_URL}/api/templates" | jq '.templates | keys'

# 6. 测试从模板创建服务器
echo ""
echo "6. 从自定义模板创建服务器..."
curl -s -X POST "${BASE_URL}/api/templates/custom-node-app/create" \
  -H "Content-Type: application/json" \
  -d '{"name":"test-server-from-template","port":8888}' | jq '.success'

# 7. 验证服务器已创建
echo ""
echo "7. 查看创建的服务器..."
curl -s "${BASE_URL}/api/servers" | jq '.[] | select(.name == "test-server-from-template") | .name'

# 8. 清理测试服务器
echo ""
echo "8. 删除测试服务器..."
curl -s -X DELETE "${BASE_URL}/api/servers/test-server-from-template" | jq '.success'

echo ""
echo "======================================"
echo "所有测试完成!"
echo "======================================"
