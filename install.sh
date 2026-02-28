#!/bin/bash

echo "🔧 MultiMCP Manager 安装脚本"
echo "=============================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "❌ 请使用 sudo 运行此脚本"
    exit 1
fi

INSTALL_DIR="/opt/multimcp-manager"
SERVICE_NAME="multimcp-manager"

echo "📦 步骤 1/5: 创建安装目录..."
mkdir -p $INSTALL_DIR
cd /root/multimcp-manager
cp -r . $INSTALL_DIR/

echo "📦 步骤 2/5: 安装依赖..."
cd $INSTALL_DIR
npm install --production

echo "⚙️  步骤 3/5: 配置 systemd 服务..."
cat > /etc/systemd/system/$SERVICE_NAME.service << 'SYSEOF'
[Unit]
Description=MultiMCP Manager - MCP Server Process Manager
Documentation=https://github.com/Ben5772/multimcp-manager
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/multimcp-manager
Environment="PATH=/root/.nvm/versions/node/v22.22.0/bin:/usr/bin:/bin"
Environment="NODE_ENV=production"
ExecStart=/root/.nvm/versions/node/v22.22.0/bin/node web-server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=multimcp-manager
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
SYSEOF

echo "�� 步骤 4/5: 重载 systemd..."
systemctl daemon-reload

echo "🚀 步骤 5/5: 启动服务..."
systemctl enable $SERVICE_NAME
systemctl start $SERVICE_NAME

sleep 3

echo ""
echo "✅ 安装完成！"
echo ""
echo "服务状态:"
systemctl status $SERVICE_NAME --no-pager | head -10
echo ""
echo "访问地址：http://localhost:3457"
echo "外网访问：使用 localtunnel 或 nginx 反向代理"
echo ""
echo "常用命令:"
echo "  systemctl start $SERVICE_NAME    # 启动"
echo "  systemctl stop $SERVICE_NAME     # 停止"
echo "  systemctl restart $SERVICE_NAME  # 重启"
echo "  systemctl status $SERVICE_NAME   # 查看状态"
echo "  journalctl -u $SERVICE_NAME -f   # 查看日志"
