import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

// https://vite.dev/config/
export default defineConfig({
  // 静态托管（GitHub Pages / Gitee Pages 等）用相对路径引入构建产物，
  // 适配「子路径部署」：https://<用户名>.github.io/<仓库名>/，否则资源会 404 白屏
  base: './',
  plugins: [
    vue(),
    // ElementPlus 组件 / API 按需自动导入
    AutoImport({
      imports: ['vue', 'vue-router', 'pinia'],
      resolvers: [ElementPlusResolver()],
      dts: 'src/auto-imports.d.ts',
    }),
    Components({
      resolvers: [ElementPlusResolver()],
      dts: 'src/components.d.ts',
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: 'localhost',
    port: 5173,
    open: true,
    // 开发跨域代理（对接真实后端时生效，mock 阶段由 MockJS 拦截）
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        // 若真实后端接口不含 /api 前缀，可在此去掉
        // rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
