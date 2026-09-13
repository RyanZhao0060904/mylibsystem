// ============ 全局路由守卫 ============
// beforeEach 在「每次路由跳转之前」执行，是整个系统的登录/权限闸门，核心逻辑分四层：
//   1) 未登录（无 token）：白名单放行，其余一律重定向到 /login；
//   2) 已登录却访问 /login：直接踢回首页（避免重复登录）；
//   3) 已登录但动态路由还没生成（首次进入或 F5 刷新）：重新拉用户信息并重建动态路由；
//   4) 已登录且路由就绪：做页面级 RBAC 鉴权（校验路由 meta.roles 是否命中用户角色）。
// 本文件在 main.ts 中被 import 一次，保证守卫被注册。
import router from '@/router'
import { getToken } from '@/utils/auth'
import { usePermissionStore } from '@/stores/permission'
import { useUserStore } from '@/stores/user'

/** 白名单：无需登录即可访问 */
const whiteList = ['/login']

/** 第一个可访问菜单路径，作为首页 '/' 的重定向目标 */
function firstAccessPath(permissionStore: ReturnType<typeof usePermissionStore>): string {
  return permissionStore.accessRoutes[0]?.path ?? '/dashboard'
}

router.beforeEach(async (to, _from, next) => {
  const token = getToken()
  const userStore = useUserStore()
  const permissionStore = usePermissionStore()

  // 没有 token
  if (!token) {
    if (whiteList.includes(to.path)) {
      next()
    } else {
      next('/login')
    }
    return
  }

  // 有 token 访问登录页：直接跳首页
  if (to.path === '/login') {
    next('/')
    return
  }

  // 有 token 但动态路由未生成（首次进入或 F5 刷新），重新拉取信息、重建动态路由
  if (!permissionStore.isGenerated) {
    try {
      await userStore.getUserInfo()
      await permissionStore.generateRoutes()
      // 访问根路径时跳转到第一个可访问菜单；其余重新进入当前路由使其匹配到刚添加的动态路由
      if (to.path === '/') {
        next({ path: firstAccessPath(permissionStore), replace: true })
      } else {
        next({ ...to, replace: true })
      }
    } catch (error) {
      userStore.logout()
      next('/login')
    }
    return
  }

  // 已登录且路由已生成：访问根路径时跳转到第一个可访问菜单（避免 Layout 内容区空白）
  if (to.path === '/') {
    next({ path: firstAccessPath(permissionStore), replace: true })
    return
  }

  // 页面访问鉴权：路由 meta.roles 声明允许访问的角色（由菜单树 roles 同步而来），不在白名单内则跳 403
  const allowedRoles = (to.meta.roles as string[] | undefined) ?? []
  if (allowedRoles.length > 0 && !userStore.roles.some((r) => allowedRoles.includes(r))) {
    next('/403')
    return
  }

  next()
})
