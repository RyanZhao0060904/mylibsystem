// ============ 用户仓库 ============
// 负责管理「登录态 + 用户资料 + 角色」这一组全局状态：
//   - token：登录凭证，初始化时从 localStorage 读回，并开启 persist 持久化；
//   - roles：用户角色列表，供路由守卫做页面级鉴权；
//   - 同时持有三个动作：login(登录)、getUserInfo(拉资料)、logout(登出并清理)。
import { defineStore } from 'pinia'
import router, { resetRouter } from '@/router'
import { getUserInfo as getUserInfoApi, login as loginApi, logout as logoutApi } from '@/api/user'
import { getToken, removeToken, setToken } from '@/utils/auth'
import { usePermissionStore } from '@/stores/permission'
import type { LoginParams, UserInfo } from '@/types'

export const useUserStore = defineStore('user', {
  state: () => ({
    token: getToken(),
    username: '',
    nickname: '',
    roles: [] as string[],
  }),
  actions: {
    /** 登录：调用登录接口保存 token */
    async login(params: LoginParams): Promise<void> {
      const { token } = await loginApi(params)
      this.token = token
      setToken(token)
    },

    /** 获取用户信息、角色，并同步按钮权限到 permission 仓库 */
    async getUserInfo(): Promise<UserInfo> {
      const info = await getUserInfoApi()
      this.username = info.username
      this.nickname = info.nickname
      this.roles = info.roles
      usePermissionStore().permissions = info.permissions
      return info
    },

    /** 退出登录：通知后端记录登出日志，再清空状态、重置路由与权限 */
    async logout(): Promise<void> {
      try {
        await logoutApi()
      } catch {
        // 登出接口失败不阻断本地登出流程
      }
      this.token = ''
      this.username = ''
      this.nickname = ''
      this.roles = []
      removeToken()
      resetRouter()
      usePermissionStore().reset()
      router.replace('/login')
    },
  },
  // 开启 Pinia 持久化：整个 state 会被插件自动写回 localStorage，
  // 刷新页面后 token/roles 等直接恢复，避免登录态丢失。
  persist: true,
})
