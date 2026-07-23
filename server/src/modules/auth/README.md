# Auth 模块

## 职责

把 Cloud Server 请求中的 Sub2API Bearer token 转换为可信 `AuthUser`。当前实现 `Sub2ApiAuthProvider` 每次请求实时调用生产 Sub2API 的 `GET /api/v1/auth/me`。

## 接口

模块不注册独立 HTTP 路由。`app.ts` 对所有 `/api/*` 调用：

```ts
AuthProvider.verify({ authorization, userAgent, ip })
```

成功只返回 `{ id, email? }`。业务模块看不到原始 token。

## 数据结构

不创建数据库表，不缓存或持久化 token。`AuthUser.id` 来自 `/auth/me` 的 `data.id`：字符串会 trim 且不能为空，数字必须是安全整数，最终统一为字符串。

## 依赖

依赖标准 `fetch` 和固定的 Sub2API URL、路径、5 秒超时。Fastify 只信直接代理一跳，本模块转发其解析出的客户端 IP 和原始 User-Agent。

## 错误处理

- 缺少 Bearer token：`401 UNAUTHORIZED`
- Sub2API 401/403：`401 UNAUTHORIZED`
- 上游超时：`504 AUTH_TIMEOUT`
- 上游异常或响应缺少用户 ID：`502 AUTH_UPSTREAM_ERROR` / `AUTH_RESPONSE_INVALID`

日志不得记录 Authorization Header。

## 删除行为

模块不保存数据，因此没有删除接口。账号数据删除不影响 Sub2API 用户。
