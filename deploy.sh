#!/bin/bash

# Tsukimiya项目自动化部署脚本
# 需要以root权限运行
# 使用方法: ./deploy_tsukimiya.sh <server_ip>

set -e  # 任何命令失败则退出脚本

# 显示帮助信息
show_help() {
    echo "使用方法: $0 <server_ip>"
    echo "示例: $0 82.156.135.94"
    exit 1
}

# 检查参数
if [ "$#" -ne 1 ]; then
    echo "错误: 需要提供服务器IP地址作为参数"
    show_help
fi

SERVER_IP=$1
PROJECT_ROOT="/project-tsukimiya"
FRONTEND_DIR="$PROJECT_ROOT/tsukimiya-site"
BACKEND_DIR="$PROJECT_ROOT/proxyserver"
GIT_REPO="https://github.com/BPuffer/yku.tsukimiya.site.git"

echo "========================================"
echo "开始部署 Tsukimiya 项目到服务器 $SERVER_IP"
echo "========================================"

# 创建项目目录结构
echo "创建项目目录..."
mkdir -p $PROJECT_ROOT
mkdir -p $BACKEND_DIR

# 部署前端部分
echo "部署前端应用..."
if [ ! -d "$FRONTEND_DIR" ]; then
  echo "克隆前端仓库..."
  git clone $GIT_REPO $FRONTEND_DIR
else
  echo "更新前端代码..."
  cd $FRONTEND_DIR
  git pull origin main
fi

# 创建前端环境配置文件
echo "创建前端环境配置..."
cat > $FRONTEND_DIR/.env.production <<EOF
VITE_PROXY_URL=http://$SERVER_IP:5000
VITE_PROXY_HTTPS=false
EOF

# 安装前端依赖并构建
echo "安装前端依赖..."
cd $FRONTEND_DIR
npm install --force

echo "构建前端应用..."
npm run build

# 配置PM2
echo "配置PM2..."
cat > $FRONTEND_DIR/ecosystem.config.js <<EOF
module.exports = {
  apps: [{
    name: 'tsukimiya-site',
    script: 'node_modules/vite/bin/vite.js',
    args: 'preview --port 4000 --host 0.0.0.0',
    cwd: '$FRONTEND_DIR',
    autorestart: true,
    watch: false,
    env: {
      NODE_ENV: 'production'
    }
  }]
};
EOF

# 启动/重启前端服务
echo "启动前端服务..."
if pm2 list | grep -q tsukimiya-site; then
  pm2 reload tsukimiya-site
else
  pm2 start ecosystem.config.js
fi
pm2 save

# 部署后端部分
echo "部署后端服务..."
cd $BACKEND_DIR

# 复制后端文件（假设前端目录中的proxyserver是最新版本）
echo "同步后端代码..."
rsync -av --delete $FRONTEND_DIR/proxyserver/ $BACKEND_DIR/

# 创建Python虚拟环境
if [ ! -d "$BACKEND_DIR/venv" ]; then
  echo "创建Python虚拟环境..."
  python3 -m venv venv
fi

# 激活虚拟环境并安装依赖
echo "安装Python依赖..."
source $BACKEND_DIR/venv/bin/activate
pip install -U pip
pip install -r $BACKEND_DIR/requirements.txt
deactivate

# 创建后端环境配置文件
echo "创建后端环境配置..."
cat > $BACKEND_DIR/.env <<EOF
PROXY_HOST=0.0.0.0
PROXY_PORT=5000
FRONTEND_ORIGIN=http://$SERVER_IP:4000
SSL_VERIFY=false
EOF

# 配置systemd服务
echo "配置systemd服务..."
cat > /etc/systemd/system/tsukimiya-proxy.service <<EOF
[Unit]
Description=Tsukimiya Proxy Service
After=network.target

[Service]
User=root
WorkingDirectory=$BACKEND_DIR
Environment="PATH=$BACKEND_DIR/venv/bin"
EnvironmentFile=$BACKEND_DIR/.env
ExecStart=$BACKEND_DIR/venv/bin/gunicorn \\
          --workers 3 \\
          --bind 0.0.0.0:5000 \\
          main:app
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# 启用并重启后端服务
echo "启动后端服务..."
systemctl daemon-reload
systemctl enable tsukimiya-proxy.service

if systemctl is-active --quiet tsukimiya-proxy.service; then
  systemctl restart tsukimiya-proxy.service
else
  systemctl start tsukimiya-proxy.service
fi

# 配置防火墙
echo "配置防火墙..."
ufw allow 4000
ufw allow 5000
ufw reload

echo "========================================"
echo "部署完成!"
echo "前端服务: PM2管理 (端口 4000)"
echo "后端服务: systemd管理 (端口 5000)"
echo "访问地址: http://$SERVER_IP:4000"
echo "========================================"
echo "如果PM2开机启动未设置成功，请执行:"
echo "   pm2 startup"
echo "========================================"