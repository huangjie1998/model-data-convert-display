#!/bin/bash

# 建筑图纸浏览器 - 开发环境启动脚本

set -e

echo "==================================="
echo " 建筑图纸浏览器 - 开发环境启动脚本"
echo "==================================="
echo

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查 Node.js
echo "[1/3] 检查 Node.js..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}[错误] 未找到 Node.js，请先安装 Node.js 20+${NC}"
    exit 1
fi
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo -e "${YELLOW}[警告] Node.js 版本过低，建议升级到 20+${NC}"
fi
echo -e "${GREEN}[OK] Node.js 已安装: $(node --version)${NC}"

# 检查依赖
echo
echo "[2/3] 检查依赖..."
if [ ! -d "node_modules" ]; then
    echo "正在安装依赖，请稍候..."
    npm install
    if [ $? -ne 0 ]; then
        echo -e "${RED}[错误] 依赖安装失败${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}[OK] 依赖已安装${NC}"
fi

# 启动开发服务器
echo
echo "[3/3] 启动开发服务器..."
echo
echo "==================================="
echo " 前端将运行在 http://localhost:5174"
echo "==================================="
echo
echo "提示:"
echo "- 按 Ctrl+C 停止服务器"
echo "- 后端转换服务需要单独启动 (见 README.md)"
echo "- 如需启动后端，在另一个终端运行: cd server && python app.py"
echo

npm run dev
