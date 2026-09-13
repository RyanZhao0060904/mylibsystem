// ============ 读者管理 API ============
// 封装「读者（借阅人）档案」模块的接口。读者是借阅记录关联的外键对象，
// 新增/编辑维护读者基本信息；删除时后端会校验其名下是否还有未归还的借阅。
import { get, post } from '@/utils/request'
import type { PageResult, ReaderItem } from '@/types'

// 读者列表查询参数：分页必填，姓名 / 借阅证号用于筛选。
export interface ReaderQuery {
  page: number // 页码，从 1 开始
  pageSize: number // 每页条数
  name?: string // 按姓名模糊匹配
  cardNo?: string // 按借阅证号模糊匹配
}

// GET /reader/list：分页查询读者，返回 PageResult<ReaderItem>。
/** 读者列表（分页 + 筛选） */
export function getReaderList(params: ReaderQuery): Promise<PageResult<ReaderItem>> {
  return get<PageResult<ReaderItem>>('/reader/list', params)
}

// POST /reader/add：新增读者。id、createTime 由后端生成，前端只提交姓名/电话/借阅证号等字段。
/** 新增读者 */
export function addReader(data: Partial<ReaderItem>): Promise<ReaderItem> {
  return post<ReaderItem>('/reader/add', data)
}

// POST /reader/edit：编辑读者。data 中需带 id，后端按 id 定位后整体覆盖，返回更新后的档案。
/** 编辑读者 */
export function editReader(data: Partial<ReaderItem>): Promise<ReaderItem> {
  return post<ReaderItem>('/reader/edit', data)
}

// POST /reader/delete：删除读者。若该读者名下还有「未归还」的借阅记录，后端会拒绝删除并报错，
// 以此保证历史借阅记录不会失去对应的读者信息。
/** 删除读者（后端校验存在未归还借阅则不可删） */
export function deleteReader(id: number): Promise<null> {
  return post<null>('/reader/delete', { id })
}
