#!/bin/bash

# Tsukimiya项目自动化部署脚本
# 需要以root权限运行
# 使用方法: ./deploy_tsukimiya.sh <server_ip> [--https] [--cert-path <path>]

set -e  # 任何命令失败则退出脚本

# 显示帮助信息
show_help() {
    echo "使用方法: $0 <server_ip> [--https] [--cert-path <path>]"
    echo "示例:"
    echo "  HTTP部署: $0 82.156.135.94"
    echo "  HTTPS部署: $0 82.156.135.94 --https"
    echo "  自定义证书: $0 82.156.135.94 --https --cert-path /path/to/certs"
    exit 1
}

# 解析参数
USE_HTTPS=false
CERT_PATH=""
SERVER_IP=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --https)
            USE_HTTPS=true
            shift
            ;;
        --cert-path)
            if [ -z "$2" ]; then
                echo "错误: --cert-path 需要指定路径"
                show_help
            fi
            CERT_PATH="$2"
            shift 2
            ;;
        --help)
            show_help
            ;;
        *)
            if [[ -z "$SERVER_IP" ]]; then
                SERVER_IP="$1"
                shift
            else
                echo "错误: 未知参数 $1"
                show_help
            fi
            ;;
    esac
done

# 检查参数
if [ -z "$SERVER_IP" ]; then
    echo "错误: 需要提供服务器IP地址作为参数"
    show_help
fi

# 设置协议变量
if [ "$USE_HTTPS" = true ]; then
    PROTOCOL="https"
    FRONTEND_PORT=443
    BACKEND_PORT=8443
else
    PROTOCOL="http"
    FRONTEND_PORT=4000
    BACKEND_PORT=5000
fi

PROJECT_ROOT="/project-tsukimiya"
FRONTEND_DIR="$PROJECT_ROOT/tsukimiya-site"
BACKEND_DIR="$PROJECT_ROOT/proxyserver"
GIT_REPO="https://github.com/BPuffer/yku.tsukimiya.site.git"

echo "========================================"
echo "开始部署 Tsukimiya 项目到服务器 $SERVER_IP"
echo "部署模式: $PROTOCOL"
[ "$USE_HTTPS" = true ] && echo "HTTPS证书路径: ${CERT_PATH:-默认位置}"
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
VITE_PROXY_DOMAIN=$SERVER_IP:$BACKEND_PORT
VITE_PROXY_HTTPS=$USE_HTTPS
EOF

# 安装前端依赖并构建
echo "安装前端依赖..."
cd $FRONTEND_DIR
npm install --force

echo "构建前端应用..."
npm run build

# 配置PM2
echo "配置PM2..."
PM2_SCRIPT="node_modules/vite/bin/vite.js"
PM2_ARGS="preview --port $FRONTEND_PORT --host 0.0.0.0"

# 添加HTTPS参数
if [ "$USE_HTTPS" = true ]; then
    if [ -n "$CERT_PATH" ]; then
        PM2_ARGS="$PM2_ARGS --https --https.cert $CERT_PATH/fullchain.pem --https.key $CERT_PATH/privkey.pem"
    else
        PM2_ARGS="$PM2_ARGS --https"
    fi
fi

cat > $FRONTEND_DIR/ecosystem.config.js <<EOF
module.exports = {
  apps: [{
    name: 'tsukimiya-site',
    script: '$PM2_SCRIPT',
    args: '$PM2_ARGS',
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
PROXY_URL=${PROTOCOL}://$SERVER_IP:$BACKEND_PORT
FRONTEND_ORIGIN=${PROTOCOL}://$SERVER_IP:$FRONTEND_PORT
SSL_VERIFY=false
EOF

# 配置systemd服务
echo "配置systemd服务..."
GUNICORN_CMD="$BACKEND_DIR/venv/bin/gunicorn"
GUNICORN_ARGS="--workers 3 --bind 0.0.0.0:$BACKEND_PORT proxy_server:app"

# 添加HTTPS参数
if [ "$USE_HTTPS" = true ]; then
    if [ -n "$CERT_PATH" ]; then
        GUNICORN_ARGS="--keyfile $CERT_PATH/privkey.pem --certfile $CERT_PATH/fullchain.pem $GUNICORN_ARGS"
    else
        GUNICORN_ARGS="--keyfile /etc/letsencrypt/live/$SERVER_IP/privkey.pem --certfile /etc/letsencrypt/live/$SERVER_IP/fullchain.pem $GUNICORN_ARGS"
    fi
fi

cat > /etc/systemd/system/tsukimiya-proxy.service <<EOF
[Unit]
Description=Tsukimiya Proxy Service
After=network.target

[Service]
User=root
WorkingDirectory=$BACKEND_DIR
Environment="PATH=$BACKEND_DIR/venv/bin"
EnvironmentFile=$BACKEND_DIR/.env
ExecStart=$GUNICORN_CMD $GUNICORN_ARGS
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
ufw allow $FRONTEND_PORT
ufw allow $BACKEND_PORT
ufw reload

echo "========================================"
echo "部署完成!"
echo "前端服务: PM2管理 (端口 $FRONTEND_PORT)"
echo "后端服务: systemd管理 (端口 $BACKEND_PORT)"
echo "访问地址: ${PROTOCOL}://$SERVER_IP:$FRONTEND_PORT"
echo "========================================"
echo "如果PM2开机启动未设置成功，请执行:"
echo "   pm2 startup"
echo "========================================"