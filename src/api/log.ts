// ============ 操作日志 API ============
// 封装「操作日志」模块接口。系统把关键操作（登录、增删改、导出、越权等）记录成日志，
// 方便管理员事后审计「谁在什么时候做了什么」。大多数日志由后端在对应接口里自动记录，
// 只有少数纯前端动作（如导出文件）需要前端主动调用 recordLog 上报。
import { get, post } from '@/utils/request'
import type { OperationLog, PageResult } from '@/types'

// 日志查询参数：分页必填，可按操作人、时间范围筛选。
export interface LogQuery {
  page: number // 页码，从 1 开始
  pageSize: number // 每页条数
  operator?: string // 按操作人用户名筛选
  startTime?: string // 操作时间起点，与 endTime 组成范围
  endTime?: string // 操作时间终点
}

// GET /log/list：分页查询操作日志，仅 admin 可访问，返回 PageResult<OperationLog>。
/** 操作日志列表（仅 admin） */
export function getLogList(params: LogQuery): Promise<PageResult<OperationLog>> {
  return get<PageResult<OperationLog>>('/log/list', params)
}

// POST /log/record：主动上报一条操作日志。type 复用 OperationLog 的 type 联合类型，
// 保证只能传合法类别；用于「导出」等不经过后端业务接口、但需要留痕的前端动作。
/** 记录一条操作日志（供导出等纯前端动作上报） */
export function recordLog(data: { type: OperationLog['type']; description: string }): Promise<null> {
  return post<null>('/log/record', data)
}
