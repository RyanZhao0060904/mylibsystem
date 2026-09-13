// ============ 图书管理 API ============
// 集中封装「图书」模块的后端接口调用。后端为内存 mock（数据不落库、重启即重置），
// 请求仍统一走 src/utils/request.ts 的 axios 实例，由 mock 拦截并返回数据；
// 本文件只负责声明「调哪个接口、传哪些参数、拿到什么结果」，供页面组件直接调用。
import { get, post } from '@/utils/request'
import type { BookItem, PageResult } from '@/types'

// 图书列表查询参数：page / pageSize 为分页必填项，其余都是可选筛选条件（不传则不筛选）。
export interface BookQuery {
  page: number // 页码，从 1 开始
  pageSize: number // 每页条数
  name?: string // 按书名模糊匹配
  category?: string // 按分类筛选
  status?: string // 按状态筛选：'在库' | '借出'
  id?: number // 按 id 精确查询，供「详情」复用列表接口时使用
}

// GET /book/list：分页查询图书。get() 会把 params 序列化成查询字符串拼在 URL 后面
// （如 /book/list?page=1&pageSize=10&name=三国），返回 PageResult<BookItem>，
// 即 { list: 当前页记录数组, total: 满足筛选条件的总条数 }。
/** 图书列表（分页 + 筛选） */
export function getBookList(params: BookQuery): Promise<PageResult<BookItem>> {
  return get<PageResult<BookItem>>('/book/list', params)
}

// 详情没有独立的后端路由，而是复用列表接口：固定取第 1 页、每页 1 条、按 id 过滤，
// 再从返回的 list 里取第一条；取不到时返回 null，交由调用方处理「记录不存在」的情况。
/** 图书详情（复用列表接口按 id 过滤） */
export function getBookDetail(id: number): Promise<BookItem | null> {
  return get<PageResult<BookItem>>('/book/list', { page: 1, pageSize: 1, id }).then(
    (res) => res.list[0] ?? null,
  )
}

// POST /book/add：新增图书。用 Partial<BookItem> 表示「字段不必一次给全」——
// id、createTime 等由后端生成，前端只需提交表单里实际填写的字段；返回新增后的完整图书对象。
/** 新增图书 */
export function addBook(data: Partial<BookItem>): Promise<BookItem> {
  return post<BookItem>('/book/add', data)
}

// POST /book/edit：编辑图书。data 里必须带 id，后端按 id 定位原记录后整体覆盖，返回更新后的对象。
/** 编辑图书 */
export function editBook(data: Partial<BookItem>): Promise<BookItem> {
  return post<BookItem>('/book/edit', data)
}

// POST /book/delete：删除图书。返回 null 表示「操作成功、没有业务数据可返回」；
// 若该图书存在未归还的借阅记录，后端会拒绝删除并返回错误提示。
/** 删除图书 */
export function deleteBook(id: number): Promise<null> {
  return post<null>('/book/delete', { id })
}

// POST /book/batchDelete：批量删除。把多个 id 一次性交给后端处理，
// 比前端循环调用多次删除接口更高效，也能让后端在一次校验里统一处理。
/** 批量删除图书 */
export function batchDeleteBooks(ids: number[]): Promise<null> {
  return post<null>('/book/batchDelete', { ids })
}
