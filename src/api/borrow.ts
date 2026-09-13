// ============ 借阅管理 API ============
// 封装「借阅记录」模块的后端接口：借书、还书、续借、删除等。
// 借阅是核心业务，涉及图书库存联动和记录状态流转；这些「副作用」都由后端 mock 完成，
// 前端只需调用对应接口，成功后刷新列表即可看到最新状态。
import { get, post } from '@/utils/request'
import type { BorrowRecord, PageResult } from '@/types'

// 借阅记录查询参数：分页必填，其余为可选筛选条件。
export interface BorrowQuery {
  page: number // 页码，从 1 开始
  pageSize: number // 每页条数
  status?: string // 按状态筛选：'借阅中' | '已归还' | '已逾期'
  startTime?: string // 借阅时间起点，与 endTime 组成时间范围
  endTime?: string // 借阅时间终点
}

// GET /borrow/list：分页查询借阅记录，支持按状态和借阅时间范围筛选，返回 PageResult<BorrowRecord>。
// 其中 status 为 '已逾期' 的记录是读取时按 dueDate 实时计算得出的，并不真正存储。
/** 借阅记录列表（分页 + 筛选） */
export function getBorrowList(params: BorrowQuery): Promise<PageResult<BorrowRecord>> {
  return get<PageResult<BorrowRecord>>('/borrow/list', params)
}

// POST /borrow/add：新增借阅。参数只需 bookId（借哪本书）、readerId（谁借）、days（借多少天）；
// 借阅时间、应还日期、续借次数等由后端按规则生成，并同步把该书库存减 1。
/** 新增借阅（bookId + readerId + days；后端联动扣减库存） */
export function addBorrow(data: { bookId: number; readerId: number; days: number }): Promise<BorrowRecord> {
  return post<BorrowRecord>('/borrow/add', data)
}

// POST /borrow/edit：确认归还。只传记录 id，后端把该记录状态改为「已归还」、写入归还时间，
// 并把对应图书库存加 1；只有「借阅中/已逾期」的记录才能归还（后端做状态机校验）。
/** 确认归还（后端回补库存 + 状态机校验） */
export function returnBorrow(id: number): Promise<BorrowRecord> {
  return post<BorrowRecord>('/borrow/edit', { id })
}

// POST /borrow/renew：续借。id 定位记录、days 表示延长多少天（1~30 天），
// 后端把应还日期后移 days 天、renewCount +1；已逾期或已续借过的记录不允许再续。
/** 续借（按天数延长应还日期，1~30 天；已逾期/已续借过的不可续） */
export function renewBorrow(id: number, days: number): Promise<BorrowRecord> {
  return post<BorrowRecord>('/borrow/renew', { id, days })
}

// POST /borrow/delete：删除借阅记录。若删除的是「未归还」记录，后端会同步回补图书库存；
// 返回 null 表示操作成功、无业务数据返回。
/** 删除借阅记录（未归还的删除会回补库存） */
export function deleteBorrow(id: number): Promise<null> {
  return post<null>('/borrow/delete', { id })
}
