#!/usr/bin/env bash
# =============================================================================
# Automated 1-Click Server Deployment Script for Cloud Print System
# Compatible with Ubuntu / Debian Linux VPS (AWS, DigitalOcean, Hetzner, etc.)
# =============================================================================
set -e

# Terminal colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=====================================================================${NC}"
echo -e "${BLUE}       CLOUD PRINT SYSTEM - AUTOMATED 1-CLICK SERVER DEPLOY          ${NC}"
echo -e "${BLUE}=====================================================================${NC}"
echo ""

# 1. Require root or sudo
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[ERROR] Please run this script with sudo or as root:${NC}"
  echo "  sudo bash deploy-server.sh"
  exit 1
fi

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

# 2. Detect Server Public IP
SERVER_IP=$(curl -s -4 ifconfig.me || curl -s -4 icanhazip.com || echo "your_server_ip")
echo -e "${GREEN}[*] Detected Server Public IP:${NC} $SERVER_IP"
echo ""

# 3. Prompt for Domain Name (Optional)
read -p "Enter your domain name (press Enter to use server IP '$SERVER_IP'): " USER_DOMAIN
if [ -z "$USER_DOMAIN" ]; then
  DOMAIN="$SERVER_IP"
else
  DOMAIN="$USER_DOMAIN"
fi

# 4. Prompt for Worker Secret Key
DEFAULT_KEY=$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 24 ; echo '')
read -p "Enter a secret WORKER_API_KEY (press Enter for auto-generated '$DEFAULT_KEY'): " INPUT_KEY
if [ -z "$INPUT_KEY" ]; then
  WORKER_KEY="$DEFAULT_KEY"
else
  WORKER_KEY="$INPUT_KEY"
fi

echo ""
echo -e "${BLUE}[1/5] Installing Server Prerequisites (Node.js, Nginx, PM2)...${NC}"
apt-get update -y
apt-get install -y curl git nginx python3 python3-pip

# Install Node.js 20 LTS if missing
if ! command -v node &> /dev/null; then
  echo "[*] Installing Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# Install PM2 globally if missing
if ! command -v pm2 &> /dev/null; then
  echo "[*] Installing PM2..."
  npm install -g pm2
fi

echo -e "${BLUE}[2/5] Setting up Backend API...${NC}"
cd "$PROJECT_DIR/backend"

# Create backend .env
cat <<EOF > .env
PORT=5000
NODE_ENV=production
CORS_ORIGIN=*
WORKER_API_KEY=$WORKER_KEY
STORAGE_TYPE=local
MAX_FILE_SIZE_MB=25
PRINTER_IP=192.168.1.37
PRINTER_PORT=631
PRINTER_ENDPOINT=/ipp/printer
EOF

npm install --omit=dev

# Build backend if dist is not present
if [ ! -f "dist/index.js" ]; then
  npm run build
fi

# Start or restart Backend in PM2
pm2 delete printer-backend 2>/dev/null || true
pm2 start dist/index.js --name "printer-backend"
pm2 save

echo -e "${BLUE}[3/5] Setting up Frontend Web App...${NC}"
cd "$PROJECT_DIR/frontend"

# Use relative API path so Nginx handles routing directly
cat <<EOF > .env
VITE_API_URL=
EOF

npm install
npm run build

echo -e "${BLUE}[4/5] Configuring Nginx Reverse Proxy...${NC}"
NGINX_CONF="/etc/nginx/sites-available/printer"

cat <<EOF > "$NGINX_CONF"
server {
    listen 80;
    server_name $DOMAIN;

    client_max_body_size 30M;

    # Frontend Static Files
    location / {
        root $PROJECT_DIR/frontend/dist;
        index index.html index.htm;
        try_files \$uri \$uri/ /index.html;
    }

    # Proxy API calls to Node.js Backend
    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/printer
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx

echo -e "${BLUE}[5/5] Ensuring PM2 restarts automatically on reboot...${NC}"
pm2 startup systemd -u root --hp /root 2>/dev/null || true

echo ""
echo -e "${GREEN}=====================================================================${NC}"
echo -e "${GREEN}             🎉 SERVER DEPLOYMENT COMPLETED SUCCESSFULLY!            ${NC}"
echo -e "${GREEN}=====================================================================${NC}"
echo ""
echo -e "🌐 ${GREEN}Your Web App is live at:${NC} http://$DOMAIN"
echo ""
echo -e "🔌 ${YELLOW}Next Step: Configure your Local Worker on your laptop:${NC}"
echo "---------------------------------------------------------------------"
echo "Open worker/.env on your laptop and set:"
echo ""
echo "BACKEND_URL=http://$DOMAIN"
echo "WORKER_API_KEY=$WORKER_KEY"
echo "DEFAULT_PRINTER_IP=192.168.1.37"
echo "WINDOWS_PRINTER_NAME=auto"
echo ""
echo "Then double-click 'start-worker.bat' on your laptop to start printing!"
echo "====================================================================="
