#!/bin/bash

# 推送设计原则文档到语雀的脚本
# 注意：需要替换为你的语雀配置

YUQUE_API_TOKEN="your-yuque-api-token"
YUQUE_LOGIN="your-yuque-login"
REPO_SLUG="your-repo-slug"

# Markdown 文件路径
MD_FILE="/opt/multimcp-manager/design-principles.md"

echo "准备推送到语雀..."

# 读取 markdown 内容
if [ ! -f "$MD_FILE" ]; then
    echo "错误：文件不存在 $MD_FILE"
    exit 1
fi

CONTENT=$(cat "$MD_FILE")

# 创建语雀文档的 API 调用示例
# 注意：实际使用时需要安装 jq 和 curl

# 方法 1: 使用 curl 直接推送（如果语雀 API 支持）
curl -X POST "https://www.yuque.com/api/v2/repos/${YUQUE_LOGIN}/${REPO_SLUG}/docs" \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: ${YUQUE_API_TOKEN}" \
  -d '{
    "title": "软件开发中的核心设计理念指南",
    "slug": "design-principles-guide",
    "format": "markdown",
    "body": '"$(echo "$CONTENT" | jq -Rs '.')"',
    "public": 1
  }' | jq '.'

echo ""
echo "推送完成!"
echo ""
echo "==================================="
echo "手动推送步骤:"
echo "==================================="
echo "1. 打开语雀 (https://www.yuque.com)"
echo "2. 创建新文档"
echo "3. 复制以下内容:"
echo ""
echo "--- 文档开始 ---"
cat "$MD_FILE"
echo "--- 文档结束 ---"
echo ""
echo "或者使用语雀的 Markdown 导入功能"
