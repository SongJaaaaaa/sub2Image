import { defineConfig, loadEnv, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import { normalizeDevProxyConfig } from './src/lib/devProxy'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

function loadDevProxyConfig() {
  try {
    return normalizeDevProxyConfig(
      JSON.parse(readFileSync('./dev-proxy.config.json', 'utf-8')) as unknown,
    )
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code === 'ENOENT') return null
    throw error
  }
}

function createSub2Proxy(target: string, prefix: string, upstream: string): ProxyOptions {
  return {
    target,
    changeOrigin: true,
    secure: true,
    rewrite: (path) => `${upstream}${path.slice(prefix.length)}`,
    configure: (proxy) => {
      proxy.on('proxyReq', (proxyReq, req) => {
        proxyReq.removeHeader('origin')
        proxyReq.removeHeader('referer')
        console.info(`[Sub2API Proxy] ${req.method} ${req.url} -> ${target}${proxyReq.path}`)
      })
      proxy.on('proxyRes', (proxyRes, req) => {
        console.info(`[Sub2API Proxy] ${req.method} ${req.url} <- ${proxyRes.statusCode}`)
      })
      proxy.on('error', (err, req) => {
        console.error(`[Sub2API Proxy] ${req.method} ${req.url} !! ${err.message}`)
      })
    },
  }
}

export default defineConfig(({ command, mode }) => {
  const devProxyConfig = command === 'serve' ? loadDevProxyConfig() : null
  const env = loadEnv(mode, '.', '')
  const sub2Url = (env.SUB2API_URL || 'https://api.sjiaa.cc.cd').replace(/\/+$/, '')
  const cloudUrl = (env.CLOUD_API_URL || 'http://127.0.0.1:8081').replace(/\/+$/, '')
  const proxy: Record<string, ProxyOptions> = command === 'serve'
    ? {
        '/sub2api-auth': createSub2Proxy(sub2Url, '/sub2api-auth', '/api/v1'),
        '/sub2api-v1': createSub2Proxy(sub2Url, '/sub2api-v1', '/v1'),
        '/cloud-api': {
          target: cloudUrl,
          changeOrigin: true,
          rewrite: (path) => `/api${path.slice('/cloud-api'.length)}`,
        },
      }
    : {}

  if (devProxyConfig?.enabled) {
    proxy[devProxyConfig.prefix] = {
      target: devProxyConfig.target,
      changeOrigin: devProxyConfig.changeOrigin,
      secure: devProxyConfig.secure,
      rewrite: (path) =>
        path.replace(
          new RegExp(`^${devProxyConfig.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
          '',
        ),
    }
  }

  return {
    plugins: [react()],
    base: '/',
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __DEV_PROXY_CONFIG__: JSON.stringify(devProxyConfig),
    },
    server: {
      host: true,
      proxy: Object.keys(proxy).length ? proxy : undefined,
    },
  }
})
