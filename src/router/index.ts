// ============ 路由配置 ============
// 本文件承担三件事：
//   1) 定义「静态路由」——所有用户共享、无需鉴权的页面（登录页、403 无权限页、404 页）。
//   2) 提供「动态路由」能力——登录后根据后端返回的菜单树，用 router.addRoute() 把
//      业务页面挂到 Layout 之下，实现「不同角色看到不同菜单」。
//   3) 提供 resetRouter()/addNotFoundRoute() 等工具函数，供登录/退出时增删路由。
// 注意采用 hash 路由（createWebHashHistory），URL 带 # 号，优点是纯前端部署、
// 无需服务器配合配置 history 回退。
import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

/** 静态路由：login、403 */
export const constantRoutes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/index.vue'),
    meta: { title: '登录', hidden: true },
  },
  {
    path: '/403',
    name: 'Forbidden',
    component: () => import('@/views/error/403.vue'),
    meta: { title: '无权限', hidden: true },
  },
]

/**
 * Layout 作为所有业务页面的父级路由。
 * 注意：不写静态 redirect —— /dashboard 是登录后才动态添加的路由，
 * 若在此静态重定向，首次未登录访问 '/' 时会先匹配不到 /dashboard 而告警。
 * 首页重定向交给路由守卫：登录并生成动态路由后再跳转到第一个可访问菜单。
 */
const layoutRoute: RouteRecordRaw = {
  path: '/',
  name: 'Layout',
  component: () => import('@/layout/index.vue'),
  children: [],
}

// 创建路由实例。
// - history: 使用 hash 模式，URL 形如 /#/login，无需服务器做 history 回退配置。
// - routes: 初始只注册静态路由 + Layout 骨架（children 为空，业务路由稍后动态注入）。
// - scrollBehavior: 每次跳转后把滚动条复位到左上角，避免页面切换后停留在旧滚动位置。
const router = createRouter({
  history: createWebHashHistory(),
  routes: [...constantRoutes, layoutRoute],
  scrollBehavior: () => ({ left: 0, top: 0 }),
})

// 记录动态添加的路由 name，退出登录时移除
const dynamicRouteNames: string[] = []

/** 动态添加路由（挂载到 Layout 下） */
export function addDynamicRoutes(routes: RouteRecordRaw[]): void {
  routes.forEach((route) => {
    router.addRoute('Layout', route)
    if (route.name) dynamicRouteNames.push(route.name as string)
  })
}

/** 退出登录时移除所有动态路由，防止权限残留 */
export function resetRouter(): void {
  dynamicRouteNames.forEach((name) => {
    if (router.hasRoute(name)) router.removeRoute(name)
  })
  dynamicRouteNames.length = 0
}

/**
 * 404 通配路由：不能写在静态路由，必须在所有动态路由 addRoute 完成之后再添加
 */
export function addNotFoundRoute(): void {
  if (!router.hasRoute('NotFound')) {
    router.addRoute({
      path: '/:pathMatch(.*)*',
      name: 'NotFound',
      component: () => import('@/views/error/404.vue'),
      meta: { title: '页面不存在', hidden: true },
    })
  }
}

export default router
