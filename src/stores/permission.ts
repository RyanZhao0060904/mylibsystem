// ============ 权限仓库 ============
// 负责「菜单 → 动态路由 → 按钮权限」的生成与管理：
//   - accessRoutes：后端返回的菜单树，供侧边栏渲染；
//   - routes：由菜单树转换而成的 Vue 路由对象，最终被 addRoute 注册；
//   - permissions：按钮权限标识数组（如 'book:add'），供 v-permission 指令与按钮显隐使用；
//   - isGenerated：标记动态路由是否已生成。刻意「不持久化」，保证每次 F5 刷新都会
//     重新请求菜单并重建路由（否则刷新后路由丢失，页面会全部 404）。
import { defineStore } from 'pinia'
import type { RouteRecordRaw } from 'vue-router'
import { getRoutes } from '@/api/user'
import { addDynamicRoutes, addNotFoundRoute } from '@/router'
import type { RouteNode } from '@/types'

// 用 Vite 的 import.meta.glob 一次性「扫描」views 目录下所有 .vue 文件，
// 返回一个 { 路径: () => import(路径) } 的映射表。这样后端只返回组件名（如 'book/list'），
// 前端就能按 '../views/book/list.vue' 精确命中对应的懒加载组件，实现真正的按需加载。
// 懒加载视图组件映射
const viewModules = import.meta.glob('../views/**/*.vue')

/** 把 mock 返回的菜单树递归转换为 Vue 路由对象 */
// 关键点：component 字段是字符串（如 'book/list'），这里通过 viewModules 映射表
// 查到对应的懒加载函数赋给 route.component；meta 整体展开，roles 等字段原样透传，
// 供后续路由守卫做页面鉴权。存在 children 时递归转换，形成真正的树形路由。
function transformRoutes(nodes: RouteNode[]): RouteRecordRaw[] {
  return nodes.map((node): RouteRecordRaw => {
    const route: Record<string, unknown> = {
      path: node.path,
      name: node.name,
      meta: { ...node.meta },
    }
    if (node.component) {
      route.component = viewModules[`../views/${node.component}.vue`]
    }
    if (node.redirect) {
      route.redirect = node.redirect
    }
    if (node.children && node.children.length > 0) {
      route.children = transformRoutes(node.children)
    }
    return route as unknown as RouteRecordRaw
  })
}

export const usePermissionStore = defineStore('permission', {
  state: () => ({
    /** 动态菜单树（用于侧边栏渲染） */
    accessRoutes: [] as RouteNode[],
    /** 转换后的动态路由 */
    routes: [] as RouteRecordRaw[],
    /** 按钮权限标识数组 */
    permissions: [] as string[],
    /** 动态路由是否已生成（不持久化，F5 刷新后重置） */
    isGenerated: false,
  }),
  actions: {
    /** 请求 mock 菜单，解析并执行 router.addRoute() 添加动态路由 */
    async generateRoutes(): Promise<RouteRecordRaw[]> {
      if (this.isGenerated) return this.routes
      const menus = await getRoutes()
      const routes = transformRoutes(menus)
      addDynamicRoutes(routes)
      // 404 通配路由必须放在「所有动态路由注册完成之后」再添加，否则它会抢先匹配所有路径，
      // 把还没注册的业务页面全部当成 404 处理。
      addNotFoundRoute()
      this.accessRoutes = menus
      this.routes = routes
      this.isGenerated = true
      return routes
    },

    /** 清空路由数组、权限数组 */
    reset(): void {
      this.accessRoutes = []
      this.routes = []
      this.permissions = []
      this.isGenerated = false
    },
  },
})
