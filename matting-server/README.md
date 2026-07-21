# 高清抠图测试服务

基于官方 `ZhengPeng7/BiRefNet-matting` 权重的单图 CPU 测试服务。服务固定单进程、单并发，图片在内存中处理，不保存原图和结果。

模型代码固定到提交 `57f9f68b43ba337c75762b14cf3075d659007268`，避免容器重启时获取未经验证的新版本。

## 构建

```bash
docker build -t sub2image-matting:test matting-server
```

## 启动

```bash
mkdir -p /opt/matting-cache
docker run -d \
  --name sub2image-matting \
  --restart unless-stopped \
  --cpus 4 \
  -p 127.0.0.1:8091:8000 \
  -v /opt/matting-cache:/root/.cache/huggingface \
  -e MATTING_CPU_THREADS=4 \
  -e MATTING_MAX_SIDE=2048 \
  sub2image-matting:test
```

首次启动会下载约 885MB 的模型文件。查看状态：

```bash
docker logs -f sub2image-matting
curl http://127.0.0.1:8091/health
```

## 测试

```bash
curl -F image=@input.png \
  -D output.headers \
  http://127.0.0.1:8091/v1/remove-background \
  -o output.png
```

响应头 `X-Process-Time` 是服务器处理耗时，`X-Image-Size` 是实际输出尺寸。
