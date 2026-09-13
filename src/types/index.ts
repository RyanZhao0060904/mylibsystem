// ============ 全局 TypeScript 类型定义 ============
// 本文件集中声明项目共用的 TypeScript 类型：既包括与后端交互的通用结构
// （ApiResult、PageResult 等），也包括各业务实体（图书、借阅、读者、用户、角色、日志）。
// 类型的作用是在编译期约束接口的入参/出参，字段拼错、类型不符在写代码时就会被发现。

// ApiResult 是后端每个响应的外层包裹。注意：request.ts 的响应拦截器已经把 code 判断掉、
// 只把 data 字段返回给调用方，所以各 API 函数的泛型 T 直接就是 data 的业务类型，
// 而不是 ApiResult<T>（这解释了为什么接口返回 Promise<BookItem> 而不是 Promise<ApiResult<BookItem>>）。
/** 后端统一返回结构 */
export interface ApiResult<T = unknown> {
  code: number // 业务状态码：200 成功，401 未登录，403 无权限，其余为业务失败
  message: string // 提示信息（成功或失败原因）
  data: T // 实际业务数据，类型由泛型 T 决定（无数据时为空）
}

/** 登录参数 */
export interface LoginParams {
  username: string // 登录用户名
  password: string // 登录密码
}

/** 登录结果 */
export interface LoginResult {
  token: string // 登录令牌，后续请求由拦截器放到请求头 Authorization 中
}

/** 用户信息 */
export interface UserInfo {
  username: string // 登录用户名
  nickname: string // 昵称 / 显示名
  roles: string[] // 角色列表，决定能看到哪些菜单/路由
  permissions: string[] // 按钮级权限标识，决定页面按钮显隐
}

/** 图书实体（status 由 stock 推导：stock > 0 → 在库，否则借出） */
export interface BookItem {
  id: number // 图书唯一 id
  name: string // 书名
  author: string // 作者
  isbn: string // ISBN 国际标准书号，图书的全局唯一编号
  publisher: string // 出版社
  publishDate: string // 出版日期
  price: number // 定价（元）
  /** 索书号 */
  callNumber: string
  category: string // 分类，如「文学」「计算机」
  status: '在库' | '借出' // 库存状态：由 stock 推导，stock>0 为「在库」，否则为「借出」
  stock: number // 当前可借数量，借出 -1、归还 +1
  cover: string // 封面图地址
  description: string // 内容简介
  createTime: string // 录入时间
}

/** 借阅记录（'已逾期' 为读取时按 dueDate 计算得出，不落库存储） */
export interface BorrowRecord {
  id: number // 借阅记录唯一 id
  bookId: number // 关联图书 id
  bookName: string // 书名快照，冗余存储便于列表直接展示，不必再查图书表
  readerId: number // 关联读者 id
  /** 借阅人姓名（快照，冗余自读者档案） */
  borrower: string
  borrowTime: string // 借出时间
  /** 应还日期 */
  dueDate: string
  returnTime: string // 归还时间（未归还时为空字符串）
  /** 续借次数（每次续借 +1，达到上限后不可再续） */
  renewCount: number
  status: '借阅中' | '已归还' | '已逾期' // 状态联合类型：'已逾期' 是读取时按 dueDate 实时算出，不落库
}

/** 读者（借阅人）档案 */
export interface ReaderItem {
  id: number // 读者唯一 id
  name: string // 姓名
  phone: string // 联系电话
  /** 借阅证号 */
  cardNo: string
  createTime: string // 建档时间
}

/** 后台用户（不含密码） */
export interface UserItem {
  id: number // 用户唯一 id
  username: string // 登录用户名
  nickname: string // 昵称 / 显示名
  role: string // 角色，如 'admin' | 'user'
  createTime: string // 创建时间
}

/** 角色 */
export interface RoleItem {
  id: number // 角色唯一 id
  name: string // 角色名
  description: string // 角色说明
  permissions: string[] // 该角色拥有的权限标识集合，用于按钮级鉴权
}

/** 操作日志 */
export interface OperationLog {
  id: number // 日志唯一 id
  operator: string // 操作人（用户名）
  time: string // 操作时间
  description: string // 操作内容描述
  type: '登录' | '登出' | '新增' | '编辑' | '删除' | '导出' | '授权' | '越权' // 操作类别联合类型
  result: '成功' | '失败' // 操作结果联合类型
}

/** 分页查询参数 */
export interface PageQuery {
  page: number // 页码，从 1 开始
  pageSize: number // 每页条数
  [key: string]: unknown // 索引签名：允许再附加任意筛选字段（如 name、status 等）
}

/** 分页返回结果 */
export interface PageResult<T> {
  list: T[] // 当前页数据数组
  total: number // 满足筛选条件的总条数，前端用它计算总页数
}

/** 菜单 / 动态路由节点（mock 返回） */
export interface RouteNode {
  path: string // 路由路径，如 '/book'
  name: string // 路由名称，用于动态注册路由时唯一标识
  redirect?: string // 重定向地址（可选），父级菜单常重定向到第一个子菜单
  /** 视图组件相对路径，如 'book/list' */
  component?: string
  meta: {
    title: string // 菜单标题，显示在侧边栏
    icon?: string // 菜单图标（可选）
    hidden?: boolean // 是否在侧边栏隐藏（可选），用于登录页等无需展示的路由
    /** 允许访问的角色，缺省表示所有角色 */
    roles?: string[]
  }
  children?: RouteNode[] // 子菜单/子路由（可选），实现多级菜单
}
