#!/bin/bash

# CAD Converter 后端服务启动脚本

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}===================================${NC}"
echo -e "${BLUE}  CAD Converter 后端服务启动脚本${NC}"
echo -e "${BLUE}===================================${NC}"
echo

# 设置环境变量
export FLASK_APP=app.py
export PYTHONUNBUFFERED=1

# 检测环境
if [ -z "$FLASK_ENV" ]; then
    export FLASK_ENV=development
fi

echo -e "环境: ${GREEN}$FLASK_ENV${NC}"
echo

# 检查 Python
echo "[1/4] 检查 Python..."
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}[错误] 未找到 Python3${NC}"
    exit 1
fi
echo -e "${GREEN}[OK] Python: $(python3 --version)${NC}"

# 检查 pip
echo
echo "[2/4] 检查 pip..."
if ! command -v pip3 &> /dev/null; then
    echo -e "${RED}[错误] 未找到 pip3${NC}"
    exit 1
fi
echo -e "${GREEN}[OK] pip 已安装${NC}"

# 创建虚拟环境（如果不存在）
echo
echo "[3/4] 设置虚拟环境..."
if [ ! -d "venv" ]; then
    echo "创建虚拟环境..."
    python3 -m venv venv
fi

# 激活虚拟环境
source venv/bin/activate
echo -e "${GREEN}[OK] 虚拟环境已激活${NC}"

# 安装依赖
echo
echo "[4/4] 检查依赖..."
pip install -q -r requirements.txt
echo -e "${GREEN}[OK] 依赖已安装${NC}"

# 创建必要的目录
echo
mkdir -p uploads converted

# 检查转换工具
echo "检查可用的转换工具..."
echo -e "${YELLOW}-----------------------------------${NC}"

check_tool() {
    if command -v "$1" &> /dev/null; then
        echo -e "✓ $1: ${GREEN}已安装${NC}"
        return 0
    else
        echo -e "✗ $1: ${YELLOW}未安装${NC}"
        return 1
    fi
}

check_tool "ODAFileConverter"
check_tool "librecad"
check_tool "inkscape"
check_tool "assimp"

echo -e "${YELLOW}-----------------------------------${NC}"
echo

# 启动服务
echo -e "${GREEN}===================================${NC}"
echo -e "${GREEN} 启动 CAD Converter 服务...${NC}"
echo -e "${GREEN}===================================${NC}"
echo
echo "API 地址:"
echo "  - 健康检查: http://localhost:5000/api/health"
echo "  - 文件上传: http://localhost:5000/api/upload"
echo "  - 工具状态: http://localhost:5000/api/converters/status"
echo
echo -e "按 ${YELLOW}Ctrl+C${NC} 停止服务"
echo

python3 app.py
