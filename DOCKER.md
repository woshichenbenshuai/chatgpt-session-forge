# Docker 部署

这个项目已经可以用 Docker / Docker Compose 部署。默认 Compose 只绑定服务器本机 `127.0.0.1:16010`，避免账号密码、refresh token、ChatGPT token 管理界面直接暴露到公网。

## 1. 准备服务器

安装 Docker 和 Docker Compose 插件后，把项目放到服务器目录，例如：

```bash
cd /opt
git clone <your-repo-url> chatgpt-session-forge
cd chatgpt-session-forge
```

如果你是直接上传源码，进入项目目录即可。

## 2. 配置环境变量

```bash
cp .env.example .env
nano .env
```

建议至少修改：

```env
BASIC_AUTH_USERNAME=admin
BASIC_AUTH_PASSWORD=replace-with-a-strong-password
```

如果服务器出站访问 ChatGPT/OpenAI/Outlook 需要代理，可以配置：

```env
OUTBOUND_PROXY=http://host.docker.internal:7897
```

不用代理可设置：

```env
OUTBOUND_PROXY=direct
```

## 3. 启动

```bash
docker compose up -d --build
```

查看状态：

```bash
docker compose ps
docker compose logs -f
```

## 4. 访问方式

默认只能从服务器本机访问：

```text
http://127.0.0.1:16010
```

推荐用 SSH 隧道在本地打开：

```bash
ssh -L 16010:127.0.0.1:16010 root@your-server-ip
```

然后在本地浏览器访问：

```text
http://127.0.0.1:16010
```

如果你确认已经设置了强密码、服务器防火墙和反向代理鉴权，也可以把 `docker-compose.yml` 里的端口改为：

```yaml
ports:
  - "16010:3000"
```

## 5. 数据持久化

账号和登录结果保存在宿主机：

```text
./data/accounts.json
```

日志目录挂载到：

```text
./logs
```

升级或重建容器不会删除这两个目录。

## 6. CPA 仓管访问宿主机服务

容器内的 `localhost` 是容器自己，不是宿主机。如果 CLIProxyAPI 跑在宿主机 `8317` 端口，CPA 地址填写：

```text
http://host.docker.internal:8317
```

`docker-compose.yml` 已配置 `host.docker.internal` 映射。

## 7. 常用维护命令

重启：

```bash
docker compose restart
```

停止：

```bash
docker compose down
```

更新源码后重建：

```bash
docker compose up -d --build
```

检查健康状态：

```bash
docker inspect --format='{{json .State.Health}}' chatgpt-session-forge
```

## 8. 数据目录权限

镜像启动时会自动修正 `/app/data` 和 `/app/logs` 的权限，再降权为 `node` 用户运行应用。修改 Dockerfile 后需要重建镜像：

```bash
docker compose up -d --build
```

如果你仍然遇到 `/app/data/accounts.json` permission denied，通常是旧容器或旧镜像未重建，先执行：

```bash
docker compose down
docker compose up -d --build
```
