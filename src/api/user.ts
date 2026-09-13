// ============ 用户 / 认证 API ============
// 本文件既包含登录/登出、当前用户信息、动态路由等「认证与会话」接口，
// 也包含后台用户（账号）的增删改查。登录成功后后端返回 token，后续所有请求
// 都由 request.ts 的拦截器自动携带该 token，用于识别当前操作者身份。
import { get, post } from '@/utils/request'
import type { LoginParams, LoginResult, PageResult, RouteNode, UserInfo, UserItem } from '@/types'

// POST /login：登录。入参为用户名 + 密码，后端校验通过后返回 { token }，
// 前端把 token 存起来（见 utils/auth.ts），后续请求用它作为身份凭证。
/** 登录 */
export function login(data: LoginParams): Promise<LoginResult> {
  return post<LoginResult>('/login', data)
}

// POST /logout：登出。通知后端结束会话（后端会记录一条登出日志），前端随后清除本地 token。
/** 登出（后端记录登出日志） */
export function logout(): Promise<null> {
  return post<null>('/logout')
}

// GET /user/info：获取当前登录用户信息。roles 决定能看到的菜单，permissions 决定按钮级权限，
// 前端据此做动态路由生成和按钮显隐控制。
/** 获取当前用户信息（角色、按钮权限） */
export function getUserInfo(): Promise<UserInfo> {
  return get<UserInfo>('/user/info')
}

// GET /user/routes：按当前用户角色返回可访问的菜单/路由树。前端在登录后据此动态生成
// 侧边栏菜单和页面路由，实现「不同角色看到不同菜单」的权限控制。
/** 根据角色获取动态菜单 / 路由 */
export function getRoutes(): Promise<RouteNode[]> {
  return get<RouteNode[]>('/user/routes')
}

// POST /user/changePassword：修改当前登录用户密码。需提供旧密码做二次校验，防止他人越权改密。
/** 修改当前用户密码 */
export function changePassword(data: { oldPassword: string; newPassword: string }): Promise<null> {
  return post<null>('/user/changePassword', data)
}

// 用户列表查询参数：分页必填，可按用户名模糊筛选。
export interface UserQuery {
  page: number // 页码，从 1 开始
  pageSize: number // 每页条数
  username?: string // 按用户名模糊匹配
}

// GET /user/list：后台用户列表，仅 admin 角色可访问（后端做权限校验）。
/** 用户列表（仅 admin） */
export function getUserList(params: UserQuery): Promise<PageResult<UserItem>> {
  return get<PageResult<UserItem>>('/user/list', params)
}

// 新增/编辑用户的提交表单结构：字段都设为可选，是为了让「新增」和「编辑」共用一个类型——
// 新增时无需 id，编辑时不必每次都给密码。
export interface UserForm {
  id?: number // 编辑时必带，用于定位要修改的用户
  username?: string // 登录用户名（新增时必填）
  password?: string // 初始密码（新增时使用，编辑时留空表示不修改）
  nickname?: string // 昵称 / 显示名
  role?: string // 角色，如 'admin' | 'user'
}

// POST /user/add：新增后台用户，返回创建后的用户信息（UserItem 不含密码）。
/** 新增用户 */
export function addUser(data: UserForm): Promise<UserItem> {
  return post<UserItem>('/user/add', data)
}

// POST /user/edit：编辑用户，通常只改昵称 / 角色等非敏感信息；密码修改另走 reset 接口。
/** 编辑用户（昵称 / 角色） */
export function editUser(data: UserForm): Promise<UserItem> {
  return post<UserItem>('/user/edit', data)
}

// POST /user/delete：删除后台用户；admin 自身等关键账号后端会拒绝删除。
/** 删除用户 */
export function deleteUser(id: number): Promise<null> {
  return post<null>('/user/delete', { id })
}

// POST /user/reset：重置用户密码。password 可省略，省略时后端用默认密码重置，
// 常用于管理员帮用户找回/重置密码的场景。
/** 重置用户密码 */
export function resetUserPassword(id: number, password?: string): Promise<null> {
  return post<null>('/user/reset', { id, password })
}
