// ============ 角色管理 API ============
// 封装「角色」模块接口。角色是权限的载体：每个角色对应一组权限（permissions），
// 用户通过「绑定角色」间接获得权限。这里用 save 一个接口同时承担新增和编辑。
import { get, post } from '@/utils/request'
import type { PageResult, RoleItem } from '@/types'

// 角色列表查询参数：分页必填，可按角色名模糊筛选。
export interface RoleQuery {
  page: number // 页码，从 1 开始
  pageSize: number // 每页条数
  name?: string // 按角色名模糊匹配
}

// GET /role/list：分页查询角色，返回 PageResult<RoleItem>，每个角色带 permissions 权限数组。
/** 角色列表 */
export function getRoleList(params: RoleQuery): Promise<PageResult<RoleItem>> {
  return get<PageResult<RoleItem>>('/role/list', params)
}

// POST /role/save：新增或编辑角色（带 id 为编辑、不带 id 为新增），
// 同时保存该角色的权限分配；返回保存后的完整角色对象。
/** 新增 / 编辑角色（含权限分配） */
export function saveRole(data: Partial<RoleItem>): Promise<RoleItem> {
  return post<RoleItem>('/role/save', data)
}

// POST /role/delete：删除角色。若还有用户绑定该角色，后端会拒绝删除，避免出现「无角色用户」。
/** 删除角色 */
export function deleteRole(id: number): Promise<null> {
  return post<null>('/role/delete', { id })
}
