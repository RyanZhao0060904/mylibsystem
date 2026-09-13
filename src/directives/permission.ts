// ============ v-permission 自定义指令 ============
// 用于「按钮级」权限控制：在元素上写 v-permission="['book:add']"，若当前用户没有该权限，
// 则在 mounted 阶段直接把元素从 DOM 中移除，实现「无权限的按钮根本不显示」。
// 相比 v-if 的写法，指令的优点是：权限逻辑集中在指令里，模板更干净，且与角色解耦、
// 只关心「具体权限标识」，符合 RBAC 的细粒度授权思路。
import type { Directive, DirectiveBinding } from 'vue'
import { usePermissionStore } from '@/stores/permission'

/**
 * 按钮权限判断
 * - admin 拥有 '*' 通配，直接放行
 * - 传入权限标识（字符串或数组），用户具备其一即可
 */
function hasPermission(value: string | string[]): boolean {
  const permissionStore = usePermissionStore()
  const permissions = permissionStore.permissions
  if (permissions.includes('*')) return true
  const required = Array.isArray(value) ? value : [value]
  return required.some((perm) => permissions.includes(perm))
}

/**
 * v-permission 自定义权限指令
 * 用法：<el-button v-permission="['book:add']">新增图书</el-button>
 */
export const permission: Directive = {
  // 在元素挂载到 DOM 时判断权限：无权限就 removeChild 移除。
  // 注意这里用 removeChild 而非设置 display:none——移除后节点彻底消失，不会占位也不会被误触。
  // 由于权限在登录后固定、页面内不会动态变化，这里只需处理 mounted，无需再监听 updated。
  mounted(el: HTMLElement, binding: DirectiveBinding<string | string[]>) {
    const value = binding.value
    if (!value) return
    if (!hasPermission(value)) {
      el.parentNode?.removeChild(el)
    }
  },
}
