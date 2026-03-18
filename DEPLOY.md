# 部署指南

## 概述

本指南介绍如何将建筑图纸浏览器部署到生产环境。

## 部署选项

### 选项 1: Docker Compose (推荐)

这是最简单和推荐的部署方式。

#### 步骤

1. **克隆/复制项目文件到服务器**

2. **构建前端**
```bash
npm install
npm run build
```

3. **启动服务**
```bash
docker-compose up -d
```

4. **验证部署**
```bash
# 检查后端健康状态
curl http://localhost:5000/api/health

# 查看容器日志
docker-compose logs -f
```

#### 访问服务

- 前端: http://localhost
- 后端 API: http://localhost:5000/api

### 选项 2: 独立部署

适用于需要更细粒度控制的场景。

#### 前端部署

1. 构建前端
```bash
npm run build
```

2. 配置 Web 服务器

**Nginx 配置示例:**
```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /path/to/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # 反向代理到后端
    location /api {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

#### 后端部署

1. 安装 Python 依赖
```bash
cd server
pip install -r requirements.txt
```

2. 安装转换工具 (可选但推荐)

**ODA File Converter (推荐用于 DWG 转换):**
- 访问 https://www.opendesign.com/guestfiles/odafileconverter
- 下载并安装 Linux 版本
- 确保 `ODAFileConverter` 在系统 PATH 中

**LibreCAD (备选):**
```bash
# Ubuntu/Debian
sudo apt-get install librecad

# CentOS/RHEL
sudo yum install librecad
```

3. 启动后端服务

**使用 Flask 内置服务器 (仅用于开发):**
```bash
python app.py
```

**使用 Gunicorn (生产环境推荐):**
```bash
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

**使用 Systemd 服务:**

创建 `/etc/systemd/system/cad-converter.service`:
```ini
[Unit]
Description=CAD Converter Backend
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/server
Environment="FLASK_ENV=production"
Environment="PYTHONUNBUFFERED=1"
ExecStart=/usr/bin/python3 /path/to/server/app.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

启动服务:
```bash
sudo systemctl daemon-reload
sudo systemctl enable cad-converter
sudo systemctl start cad-converter
```

## 配置

### 环境变量

#### 前端 (.env.production)

```bash
# 生产环境 API 地址
# 使用相对路径让前端自动检测当前域名
VITE_API_URL=/api

# 或者指定完整 URL
# VITE_API_URL=https://api.your-domain.com/api
```

#### 后端

```bash
# Flask 环境
FLASK_ENV=production

# 上传文件大小限制 (MB)
MAX_FILE_SIZE=100

# 临时文件保留时间 (小时)
CLEANUP_INTERVAL=24
```

### 反向代理配置

#### Nginx

```nginx
upstream backend {
    server 127.0.0.1:5000;
}

server {
    listen 80;
    server_name your-domain.com;
    
    # 前端静态文件
    location / {
        root /path/to/dist;
        try_files $uri $uri/ /index.html;
        
        # 缓存配置
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 30d;
            add_header Cache-Control "public, immutable";
        }
    }
    
    # 后端 API
    location /api {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # 上传大文件配置
        client_max_body_size 100M;
        proxy_read_timeout 300s;
    }
}
```

#### Caddy

```caddyfile
your-domain.com {
    root * /path/to/dist
    file_server
    try_files {path} {path}/ /index.html
    
    reverse_proxy /api/* localhost:5000
}
```

## SSL/HTTPS 配置

### 使用 Let's Encrypt + Certbot (Nginx)

```bash
# 安装 Certbot
sudo apt-get install certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d your-domain.com

# 自动续期测试
sudo certbot renew --dry-run
```

### 使用 Caddy (自动 HTTPS)

Caddy 会自动获取和续期 Let's Encrypt 证书。

```caddyfile
your-domain.com {
    tls your-email@example.com
    
    root * /path/to/dist
    file_server
    
    reverse_proxy /api/* localhost:5000
}
```

## 监控和日志

### Docker 日志

```bash
# 查看所有服务日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f backend

# 限制日志大小
# 在 docker-compose.yml 中添加:
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

### 后端日志

后端日志输出到 stdout，可以使用以下方式收集：

```bash
# 查看日志
journalctl -u cad-converter -f

# 或使用 docker logs
docker logs -f cad-converter-backend
```

### 健康检查

```bash
# 前端健康检查
curl http://localhost

# 后端健康检查
curl http://localhost:5000/api/health

# 转换工具状态
curl http://localhost:5000/api/converters/status
```

## 备份和恢复

### 备份上传的文件

```bash
# Docker 部署
mkdir -p /backup/cad-converter
docker cp cad-converter-backend:/tmp/cad_converter /backup/cad-converter/

# 或挂载卷方式
tar -czf /backup/cad-uploads-$(date +%Y%m%d).tar.gz /var/lib/docker/volumes/cad-converter_cad_uploads/_data
```

### 自动清理

后端会自动清理超过 24 小时的临时文件。手动清理：

```bash
# 调用清理 API
curl -X POST http://localhost:5000/api/cleanup

# 或在服务器上手动清理
rm -rf /tmp/cad_converter/*
```

## 故障排除

### 常见问题

#### 1. 后端连接失败

**症状**: 上传文件时显示 "后端服务未运行"

**检查**:
```bash
# 检查后端是否运行
curl http://localhost:5000/api/health

# 检查端口占用
sudo netstat -tlnp | grep 5000

# 检查防火墙
sudo ufw status
```

#### 2. SKP/DWG 转换失败

**症状**: 上传 SKP/DWG 后显示 "转换失败"

**检查**:
```bash
# 查看转换工具状态
curl http://localhost:5000/api/converters/status

# 查看后端日志
docker logs cad-converter-backend | tail -50
```

**解决**:
- 确保 ODA File Converter 已正确安装
- 检查文件是否损坏
- 尝试手动转换后上传其他格式

#### 3. 前端 404 错误

**症状**: 刷新页面后出现 404

**解决**:
确保 Nginx/Caddy 配置中包含 `try_files`:
```nginx
try_files $uri $uri/ /index.html;
```

#### 4. CORS 错误

**症状**: 浏览器控制台显示 CORS 错误

**检查**:
- 确认后端 `app.py` 中的 CORS 配置正确
- 检查 API 地址是否正确

#### 5. 大文件上传失败

**症状**: 上传大文件时超时或失败

**解决**:
- 增加 Nginx 的 `client_max_body_size`
- 增加后端 `MAX_FILE_SIZE` 环境变量
- 检查网络超时设置

### 性能优化

1. **启用 Gzip 压缩** (Nginx)
```nginx
gzip on;
gzip_types text/plain text/css application/json application/javascript text/xml;
```

2. **静态文件缓存**
```nginx
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
    expires 30d;
    add_header Cache-Control "public, immutable";
}
```

3. **CDN 加速**
将 `dist/assets` 目录部署到 CDN。

## 安全建议

1. **使用 HTTPS**: 强制所有通信使用 SSL
2. **文件类型检查**: 后端已限制上传文件类型
3. **文件大小限制**: 默认 100MB，可根据需要调整
4. **定期清理**: 配置自动清理临时文件
5. **访问控制**: 如需认证，在 Nginx 或后端添加

## 更新部署

### 更新前端

```bash
# 拉取新代码
git pull

# 重新构建
npm install
npm run build

# Docker 方式
docker-compose restart frontend

# 手动方式
# 直接替换 dist 目录文件
```

### 更新后端

```bash
# Docker 方式
docker-compose pull
docker-compose up -d

# 手动方式
# 拉取新代码后重启服务
sudo systemctl restart cad-converter
```

## 支持

如有问题，请查看：
- 项目 README.md
- GitHub Issues
- 后端日志
