// ==================== 文件说明 ====================
// 本文件是整个项目的 mock 后端核心：用 MockJS 拦截前端发出的 HTTP 请求并返回模拟数据，
// 数据源来自 ./data.ts 中的内存数据库 db，因此无需真实后端即可跑通前后端完整联调。
//
// 每个 Mock.mock(url, method, handler) 注册一个接口：
//   url     —— 字符串表示精确匹配；正则（如 /\/api\/book\/list/）表示模糊匹配，可命中带 query 的请求。
//   method  —— 请求方法（get / post）。
//   handler —— 处理函数，其返回值会被 MockJS 包装后作为响应返回给前端。
//
// 所有接口遵循统一的返回结构约定 { code, message, data }：
//   code    —— 200 成功、400 参数/业务错误、401 未登录、403 无权限、404 资源不存在、500 服务器错误；
//   message —— 给前端的提示文案；data —— 实际业务数据（分页接口为 { list, total }）。
// 鉴权方式：前端登录后拿到 token 并保存，后续请求由 getCurrentUser() 依据 token 反查当前用户，
// 再由 requirePerm / requireAdmin 做权限校验（RBAC：角色 → 权限码，admin 拥有 ['*'] 通配符）。
import Mock from 'mockjs'
import { getToken } from '@/utils/auth'
import { db, type MockUser } from './data'
import type {
  ApiResult,
  BookItem,
  BorrowRecord,
  OperationLog,
  PageResult,
  ReaderItem,
  RoleItem,
  RouteNode,
  UserInfo,
  UserItem,
} from '@/types'

/** mockjs 传入处理函数的 options（仅含 url/type/body，不含请求头） */
type MockHandlerOptions = { url: string; type: string; body: string }

// ==================== 工具函数 ====================
// now() 返回当前时间，格式化为固定宽度的 "YYYY-MM-DD HH:mm:ss"。
// 因为每一位都用 0 补齐（如 09:05），所以直接用字符串比较就能判断时间先后（用于逾期判断、时间区间筛选）。
function now(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** 日期字符串加 days 天 */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr.replace(' ', 'T'))
  d.setDate(d.getDate() + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// ok / fail 是构造统一响应体的两个工具函数：
//   ok   返回 code=200 的成功响应；
//   fail 返回失败响应（默认 code=500，可传 400/401/403/404 等具体状态码）。
// 前端统一约定：code===200 即成功，否则读取 message 提示、按 code 分支处理。
function ok<T>(data: T): ApiResult<T> {
  return { code: 200, message: 'success', data }
}

function fail(message: string, code = 500): ApiResult<null> {
  return { code, message, data: null }
}

/** 解析 query string */
function parseQuery(url: string): Record<string, string> {
  const idx = url.indexOf('?')
  if (idx === -1) return {}
  const params = new URLSearchParams(url.slice(idx + 1))
  const result: Record<string, string> = {}
  params.forEach((value, key) => {
    result[key] = value
  })
  return result
}

/** 解析 JSON body */
function parseBody(options: MockHandlerOptions): Record<string, any> {
  if (!options.body) return {}
  try {
    return JSON.parse(options.body)
  } catch {
    return {}
  }
}

/** 生成 token（用户名编码进 token，刷新后仍可解析） */
function generateToken(username: string): string {
  return `mock-token-${username}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// 从 token 中反解用户名：token 格式为 mock-token-<username>-<时间戳>-<随机串>，
// 这里用正则取出中间的 username 段，模拟真实后端从 JWT 中解析身份信息。
function parseUsernameFromToken(token: string): string | null {
  const match = token.match(/^mock-token-([a-zA-Z0-9]+)-/)
  return match ? match[1] : null
}

/** 根据当前 token 获取调用者（模拟后端读取 Authorization 头） */
function getCurrentUser(): MockUser | null {
  const token = getToken()
  if (!token) return null
  const username = parseUsernameFromToken(token)
  if (!username) return null
  return db.users.find((u) => u.username === username) ?? null
}

// 根据用户所属角色名，查出该角色拥有的权限码数组（未登录或角色不存在则返回空数组）。
function getUserPermissions(user: MockUser | null): string[] {
  if (!user) return []
  const role = db.roles.find((r) => r.name === user.role)
  return role ? role.permissions : []
}

/** 权限判断：admin 拥有 '*' 通配 */
function hasPerm(user: MockUser | null, perm: string): boolean {
  if (!user) return false
  const perms = getUserPermissions(user)
  return perms.includes('*') || perms.includes(perm)
}

// 判断当前用户是否为超级管理员（role === 'admin'）。
function isAdmin(user: MockUser | null): boolean {
  return !!user && user.role === 'admin'
}

/** 记录操作日志（增删改、登录登出、导出、越权自动调用） */
// unshift 把新日志插到数组最前面，保证"操作日志"页面最新的动作排在最上；id 用 logIdSeed++ 自增。
function logOperation(
  operator: string,
  type: OperationLog['type'],
  description: string,
  result: OperationLog['result'] = '成功',
): void {
  db.operationLogs.unshift({ id: db.logIdSeed++, operator, time: now(), description, type, result })
}

/** 记录一次越权尝试（审计） */
function logDenied(user: MockUser | null, description: string): void {
  logOperation(user?.nickname ?? '未知用户', '越权', description, '失败')
}

/** 分页 */
// 分页是纯内存实现：先算总条数 total，再用 slice 截取当前页数据。
// 注意 page 从 1 开始，所以起始下标 = (page-1)*pageSize；返回 { list, total } 供前端表格分页。
function paginate<T>(list: T[], page: number, pageSize: number): PageResult<T> {
  const total = list.length
  const start = (page - 1) * pageSize
  return { list: list.slice(start, start + pageSize), total }
}

/** 图书状态由库存推导：stock > 0 → 在库，否则借出 */
function syncBookStatus(book: BookItem): void {
  book.status = book.stock > 0 ? '在库' : '借出'
}

/** 该书是否存在未归还借阅 */
function bookHasActiveBorrow(bookId: number): boolean {
  return db.borrows.some((b) => b.bookId === bookId && b.status === '借阅中')
}

/** 该读者是否存在未归还借阅 */
function readerHasActiveBorrow(readerId: number): boolean {
  return db.borrows.some((b) => b.readerId === readerId && b.status === '借阅中')
}

/** 该读者是否存在逾期未还的借阅（借阅中且已过应还日期） */
function readerHasOverdueBorrow(readerId: number): boolean {
  return db.borrows.some((b) => b.readerId === readerId && b.status === '借阅中' && b.dueDate < now())
}

/** 借阅中且已过应还日期 → 标记为已逾期（读取时计算，不落库） */
function withEffectiveStatus(record: BorrowRecord): BorrowRecord {
  if (record.status === '借阅中' && record.dueDate && record.dueDate < now()) {
    return { ...record, status: '已逾期' }
  }
  return record
}

/** 鉴权结果：通过时返回用户，失败时返回错误响应（含 401 / 403 + 越权日志） */
type AuthResult = { user: MockUser } | ApiResult<null>
// 使用约定：鉴权通过返回 { user }（没有 code 字段），失败返回 { code, message, data }。
// 所以每个接口处理函数都先调用守卫，再用 if ('code' in auth) return auth 提前返回错误响应，
// 通过后再用 auth.user 取当前用户——这是贯穿所有接口的统一鉴权写法。

/** 登录 + 权限守卫：通过返回 { user }，失败返回错误响应 */
function requirePerm(perm: string, action: string): AuthResult {
  const user = getCurrentUser()
  if (!user) return fail('未登录或登录已失效', 401)
  if (!hasPerm(user, perm)) {
    logDenied(user, `越权尝试：${action}`)
    return fail(`没有权限${action}`, 403)
  }
  return { user }
}

/** 仅管理员守卫 */
function requireAdmin(action: string): AuthResult {
  const user = getCurrentUser()
  if (!user) return fail('未登录或登录已失效', 401)
  if (!isAdmin(user)) {
    logDenied(user, `越权尝试：${action}`)
    return fail(`没有权限${action}`, 403)
  }
  return { user }
}

// ==================== 完整菜单树（admin 全量） ====================
// 这是前端动态路由的"数据源"：admin 看到全部菜单；lib 会经 filterMenus 过滤掉
// meta.roles 仅含 'admin' 的菜单（角色管理、用户管理、操作日志）。
// meta.hidden 表示该路由在侧边栏隐藏（如图书详情页，只用于页面跳转、不占菜单项）。
const fullMenus: RouteNode[] = [
  { path: '/dashboard', name: 'Dashboard', component: 'dashboard/index', meta: { title: '仪表盘', icon: 'Odometer' } },
  {
    path: '/book',
    name: 'Book',
    redirect: '/book/list',
    meta: { title: '图书管理', icon: 'Reading' },
    children: [
      { path: 'list', name: 'BookList', component: 'book/list', meta: { title: '图书列表', icon: 'Notebook' } },
      { path: 'detail/:id', name: 'BookDetail', component: 'book/detail', meta: { title: '图书详情', hidden: true } },
    ],
  },
  { path: '/borrow/list', name: 'BorrowList', component: 'borrow/list', meta: { title: '借阅管理', icon: 'Tickets' } },
  { path: '/reader/list', name: 'ReaderList', component: 'reader/list', meta: { title: '读者管理', icon: 'Avatar', roles: ['admin', 'lib'] } },
  { path: '/role/list', name: 'RoleList', component: 'role/list', meta: { title: '角色管理', icon: 'UserFilled', roles: ['admin'] } },
  { path: '/user/list', name: 'UserList', component: 'user/list', meta: { title: '用户管理', icon: 'Avatar', roles: ['admin'] } },
  { path: '/log/operation', name: 'LogOperation', component: 'log/operation', meta: { title: '操作日志', icon: 'Document', roles: ['admin'] } },
  { path: '/personal', name: 'Personal', component: 'personal/index', meta: { title: '个人中心', icon: 'User' } },
]

// 按角色过滤菜单树：meta.roles 未设置表示所有登录角色可见；设置了则仅列表内角色可见。
// 这样 admin 看到全量菜单，lib 看不到"角色管理/用户管理/操作日志"等仅管理员菜单。
function filterMenus(user: MockUser | null): RouteNode[] {
  if (!user) return []
  return fullMenus.filter((node) => !node.meta.roles || node.meta.roles.includes(user.role))
}

// ==================== 认证接口 ====================

// 登录
// 从请求体解析 username/password，在 db.users 中按"用户名 + 密码"精确匹配。
// 匹配成功生成 token 返回（前端保存 token，后续请求靠它识别身份）；失败记录"登录失败"日志并返回 400。
Mock.mock('/api/login', 'post', (options: MockHandlerOptions) => {
  const { username, password } = parseBody(options)
  const user = db.users.find((u) => u.username === username && u.password === password)
  if (!user) {
    logOperation(username || '未知用户', '登录', `登录失败：账号 ${username}`, '失败')
    return fail('用户名或密码错误', 400)
  }
  logOperation(user.nickname, '登录', '登录系统')
  return ok({ token: generateToken(user.username) })
})

// 登出（记录日志）
// 登出本身无需权限校验，只需根据当前 token 找到用户、记录一条"登出"日志，然后返回成功。
// 真正的"退出"动作由前端负责：清空本地 token 并跳转登录页。
Mock.mock('/api/logout', 'post', () => {
  const user = getCurrentUser()
  if (user) logOperation(user.nickname, '登出', '退出登录')
  return ok(null)
})

// 用户信息
// 返回当前登录用户的 username/nickname/roles/permissions，
// 前端用它初始化 Pinia 用户状态，并据此做菜单渲染与按钮级权限控制。
Mock.mock('/api/user/info', 'get', () => {
  const user = getCurrentUser()
  if (!user) return fail('未登录或登录已失效', 401)
  const data: UserInfo = {
    username: user.username,
    nickname: user.nickname,
    roles: [user.role],
    permissions: getUserPermissions(user),
  }
  return ok(data)
})

// 动态菜单 / 路由
// 返回按当前用户角色过滤后的菜单树，前端据此动态生成侧边栏与可访问路由。
// 未登录返回 401，前端拦截器会据此跳转登录页。
Mock.mock('/api/user/routes', 'get', () => {
  const user = getCurrentUser()
  if (!user) return fail('未登录或登录已失效', 401)
  return ok(filterMenus(user))
})

// 修改密码
// 只要求登录（不区分角色），校验旧密码正确后把密码字段替换为新密码。
// 注意密码存在内存中，刷新页面即恢复初始值。
Mock.mock('/api/user/changePassword', 'post', (options: MockHandlerOptions) => {
  const user = getCurrentUser()
  if (!user) return fail('未登录或登录已失效', 401)
  const { oldPassword, newPassword } = parseBody(options)
  if (user.password !== oldPassword) {
    logOperation(user.nickname, '编辑', '修改密码失败：旧密码错误', '失败')
    return fail('旧密码错误', 400)
  }
  user.password = newPassword
  logOperation(user.nickname, '编辑', '修改密码')
  return ok(null)
})

// ==================== 图书接口 ====================
// 图书列表（分页 + 多条件筛选）：URL 用正则匹配，故 /api/book/list?page=1 这类带 query 的请求也能命中。
// 支持按 id / name（模糊）/ category / status 过滤，最终由 paginate 统一分页，返回 { list, total }。
Mock.mock(/\/api\/book\/list/, 'get', (options: MockHandlerOptions) => {
  const auth = requirePerm('book:view', '查看图书')
  if ('code' in auth) return auth

  const query = parseQuery(options.url)
  const page = Number(query.page || 1)
  const pageSize = Number(query.pageSize || 10)
  const name = query.name || ''
  const category = query.category || ''
  const status = query.status || ''
  const id = query.id || ''

  let list = [...db.books]
  if (id) {
    list = list.filter((b) => String(b.id) === id)
  }
  if (name) {
    list = list.filter((b) => b.name.includes(name))
  }
  if (category) {
    list = list.filter((b) => b.category === category)
  }
  if (status) {
    list = list.filter((b) => b.status === status)
  }
  return ok(paginate(list, page, pageSize))
})

// 新增图书：校验 book:add 权限后，用 db.bookIdSeed++ 生成新 id；
// 初始状态由库存推导（stock>0 为"在库"，否则"借出"），unshift 到数组头部让新书排在最前。
Mock.mock('/api/book/add', 'post', (options: MockHandlerOptions) => {
  const auth = requirePerm('book:add', '新增图书')
  if ('code' in auth) return auth
  const user = auth.user

  const body = parseBody(options)
  const stock = Number(body.stock || 0)
  const book: BookItem = {
    id: db.bookIdSeed++,
    name: body.name,
    author: body.author,
    isbn: body.isbn || '',
    publisher: body.publisher || '',
    publishDate: body.publishDate || '',
    price: Number(body.price || 0),
    callNumber: body.callNumber || '',
    category: body.category,
    status: stock > 0 ? '在库' : '借出',
    stock,
    cover: body.cover || '',
    description: body.description || '',
    createTime: now(),
  }
  db.books.unshift(book)
  logOperation(user.nickname, '新增', `新增图书《${book.name}》`)
  return ok(book)
})

// 编辑图书：按 id 找到图书后逐个字段覆盖；库存变化后用 syncBookStatus 重新推导状态，保证库存与状态一致。
Mock.mock('/api/book/edit', 'post', (options: MockHandlerOptions) => {
  const auth = requirePerm('book:edit', '编辑图书')
  if ('code' in auth) return auth
  const user = auth.user

  const body = parseBody(options)
  const book = db.books.find((b) => b.id === body.id)
  if (!book) {
    logOperation(user.nickname, '编辑', '编辑图书失败：图书不存在', '失败')
    return fail('图书不存在', 404)
  }
  book.name = body.name
  book.author = body.author
  book.isbn = body.isbn || ''
  book.publisher = body.publisher || ''
  book.publishDate = body.publishDate || ''
  book.price = Number(body.price || 0)
  book.callNumber = body.callNumber || ''
  book.category = body.category
  book.stock = Number(body.stock || 0)
  syncBookStatus(book)
  book.cover = body.cover || ''
  book.description = body.description || ''
  logOperation(user.nickname, '编辑', `编辑图书《${book.name}》`)
  return ok(book)
})

// 删除图书：删除前先做"在借校验"——若该书存在未归还借阅记录则拒绝删除，
// 否则会造成借阅记录指向一本已不存在的书，破坏数据一致性。通过后整体替换数组完成删除。
Mock.mock('/api/book/delete', 'post', (options: MockHandlerOptions) => {
  const auth = requirePerm('book:delete', '删除图书')
  if ('code' in auth) return auth
  const user = auth.user

  const { id } = parseBody(options)
  const book = db.books.find((b) => b.id === id)
  if (!book) {
    logOperation(user.nickname, '删除', '删除图书失败：图书不存在', '失败')
    return fail('图书不存在', 404)
  }
  if (bookHasActiveBorrow(id)) {
    logOperation(user.nickname, '删除', `删除图书《${book.name}》失败：存在未归还借阅`, '失败')
    return fail('该图书存在未归还借阅记录，不可删除')
  }
  db.books = db.books.filter((b) => b.id !== id)
  logOperation(user.nickname, '删除', `删除图书《${book.name}》`)
  return ok(null)
})

// 批量删除：先一次性校验所有待删图书是否都存在未归还借阅，只要有任意一本不满足就整体拒绝（保证原子性），
// 全部通过才执行删除，避免"删了一半"的中间状态。
Mock.mock('/api/book/batchDelete', 'post', (options: MockHandlerOptions) => {
  const auth = requirePerm('book:batchDelete', '批量删除图书')
  if ('code' in auth) return auth
  const user = auth.user

  const { ids } = parseBody(options) as { ids: number[] }
  const idSet = new Set(ids)
  const blocked = db.books.filter((b) => idSet.has(b.id) && bookHasActiveBorrow(b.id))
  if (blocked.length > 0) {
    logOperation(user.nickname, '删除', `批量删除失败：${blocked.length} 本存在未归还借阅`, '失败')
    return fail(`有 ${blocked.length} 本图书存在未归还借阅记录，不可删除`)
  }
  const removed = db.books.filter((b) => idSet.has(b.id))
  db.books = db.books.filter((b) => !idSet.has(b.id))
  logOperation(user.nickname, '删除', `批量删除 ${removed.length} 本图书`)
  return ok(null)
})

// ==================== 借阅接口 ====================
// 借阅列表：先用 withEffectiveStatus 把"借阅中且已逾期"的记录在返回时标记为"已逾期"
// （这是读取时的只读计算，不写回数据库），再按 status / 借出时间区间过滤并分页。
Mock.mock(/\/api\/borrow\/list/, 'get', (options: MockHandlerOptions) => {
  const auth = requirePerm('borrow:view', '查看借阅记录')
  if ('code' in auth) return auth

  const query = parseQuery(options.url)
  const page = Number(query.page || 1)
  const pageSize = Number(query.pageSize || 10)
  const status = query.status || ''
  const startTime = query.startTime || ''
  const endTime = query.endTime || ''

  let list = db.borrows.map(withEffectiveStatus)
  if (status) {
    list = list.filter((b) => b.status === status)
  }
  if (startTime) {
    list = list.filter((b) => b.borrowTime >= startTime)
  }
  if (endTime) {
    list = list.filter((b) => b.borrowTime <= endTime)
  }
  return ok(paginate(list, page, pageSize))
})

// 新增借阅（借书）：借还业务的核心接口，含完整校验链——
//   1) 借阅天数须为 1~60 的整数（业务规则：最长借 2 个月）；
//   2) 图书存在且库存 > 0，否则"库存不足"；
//   3) 读者存在；
//   4) 读者没有逾期未还的图书（逾期读者禁止再借，须先归还）。
// 全部通过后生成借阅记录（状态"借阅中"，dueDate = 借出时间 + days），并做库存联动：stock - 1、同步状态。
Mock.mock('/api/borrow/add', 'post', (options: MockHandlerOptions) => {
  const auth = requirePerm('borrow:add', '新增借阅')
  if ('code' in auth) return auth
  const user = auth.user

  const body = parseBody(options)
  const bookId = Number(body.bookId)
  const readerId = Number(body.readerId)
  const days = Number(body.days ?? 30)
  if (!Number.isInteger(days) || days < 1 || days > 60) {
    logOperation(user.nickname, '新增', '新增借阅失败：借阅天数非法', '失败')
    return fail('借阅天数须为 1~60 天之间（最长 2 个月）')
  }

  const book = db.books.find((b) => b.id === bookId)
  if (!book) return fail('图书不存在', 404)
  if (book.stock <= 0) {
    logOperation(user.nickname, '新增', `借阅《${book.name}》失败：库存不足`, '失败')
    return fail('该图书库存不足，暂不可借')
  }
  const reader = db.readers.find((r) => r.id === readerId)
  if (!reader) return fail('读者不存在', 404)
  // 逾期限制：该读者有逾期未还的图书时，不能再借
  if (readerHasOverdueBorrow(reader.id)) {
    logOperation(user.nickname, '新增', `借阅《${book.name}》失败：${reader.name} 存在逾期未还图书`, '失败')
    return fail('该读者存在逾期未还的图书，请先归还后再借阅')
  }

  const time = now()
  const record: BorrowRecord = {
    id: db.borrowIdSeed++,
    bookId: book.id,
    bookName: book.name,
    readerId: reader.id,
    borrower: reader.name,
    borrowTime: time,
    dueDate: addDays(time, days),
    returnTime: '',
    renewCount: 0,
    status: '借阅中',
  }
  db.borrows.unshift(record)
  book.stock -= 1
  syncBookStatus(book)
  logOperation(user.nickname, '新增', `新增借阅《${book.name}》- ${reader.name}`)
  return ok(record)
})

// 确认归还（借阅的 edit 接口，权限码 borrow:return）：把记录状态置为"已归还"、写入 returnTime，
// 并做库存联动 stock + 1。已归还的记录再次操作会被拒绝（幂等保护，防止重复加库存）。
Mock.mock('/api/borrow/edit', 'post', (options: MockHandlerOptions) => {
  const auth = requirePerm('borrow:return', '确认归还')
  if ('code' in auth) return auth
  const user = auth.user

  const { id } = parseBody(options)
  const record = db.borrows.find((b) => b.id === id)
  if (!record) {
    logOperation(user.nickname, '编辑', '确认归还失败：记录不存在', '失败')
    return fail('借阅记录不存在', 404)
  }
  if (record.status === '已归还') {
    logOperation(user.nickname, '编辑', `归还《${record.bookName}》失败：已归还`, '失败')
    return fail('该记录已归还，请勿重复操作')
  }
  record.status = '已归还'
  record.returnTime = now()
  const book = db.books.find((b) => b.id === record.bookId)
  if (book) {
    book.stock += 1
    syncBookStatus(book)
  }
  logOperation(user.nickname, '编辑', `确认归还《${record.bookName}》`)
  return ok(record)
})

// 续借：在原应还日期 dueDate 基础上顺延 renewDays 天，并把 renewCount + 1。
// 校验链：记录存在、未归还、未逾期（已逾期必须先归还）、且最多只能续借 1 次。
// 续借不改变 status，只是延长应还日期。
Mock.mock('/api/borrow/renew', 'post', (options: MockHandlerOptions) => {
  const auth = requirePerm('borrow:renew', '续借')
  if ('code' in auth) return auth
  const user = auth.user

  const body = parseBody(options)
  const id = body.id
  const renewDays = Number(body.days ?? 30)
  if (!Number.isInteger(renewDays) || renewDays < 1 || renewDays > 30) {
    logOperation(user.nickname, '编辑', '续借失败：续借天数非法', '失败')
    return fail('续借天数须为 1~30 之间的整数')
  }
  const record = db.borrows.find((b) => b.id === id)
  if (!record) {
    logOperation(user.nickname, '编辑', '续借失败：记录不存在', '失败')
    return fail('借阅记录不存在', 404)
  }
  if (record.status === '已归还') {
    logOperation(user.nickname, '编辑', `续借《${record.bookName}》失败：已归还`, '失败')
    return fail('该记录已归还，无法续借')
  }
  if (record.dueDate < now()) {
    logOperation(user.nickname, '编辑', `续借《${record.bookName}》失败：已逾期`, '失败')
    return fail('该图书已逾期，请先归还')
  }
  if (record.renewCount >= 1) {
    logOperation(user.nickname, '编辑', `续借《${record.bookName}》失败：已达续借上限`, '失败')
    return fail('该图书已续借过，不能再次续借')
  }
  record.renewCount += 1
  record.dueDate = addDays(record.dueDate, renewDays)
  logOperation(user.nickname, '编辑', `续借《${record.bookName}》${renewDays} 天至 ${record.dueDate.slice(0, 10)}`)
  return ok(record)
})

// 删除借阅记录：若删除的是"借阅中"（未归还）记录，等价于取消借阅，需回补库存 stock + 1；
// 已归还记录则直接删除，无需回补。
Mock.mock('/api/borrow/delete', 'post', (options: MockHandlerOptions) => {
  const auth = requirePerm('borrow:delete', '删除借阅记录')
  if ('code' in auth) return auth
  const user = auth.user

  const { id } = parseBody(options)
  const record = db.borrows.find((b) => b.id === id)
  if (!record) {
    logOperation(user.nickname, '删除', '删除借阅记录失败：记录不存在', '失败')
    return fail('借阅记录不存在', 404)
  }
  // 删除未归还记录视为取消借阅，回补库存
  if (record.status === '借阅中') {
    const book = db.books.find((b) => b.id === record.bookId)
    if (book) {
      book.stock += 1
      syncBookStatus(book)
    }
  }
  db.borrows = db.borrows.filter((b) => b.id !== id)
  logOperation(user.nickname, '删除', `删除借阅记录《${record.bookName}》`)
  return ok(null)
})

// ==================== 读者接口 ====================
// 读者列表：按 name / cardNo 模糊筛选 + 分页。
Mock.mock(/\/api\/reader\/list/, 'get', (options: MockHandlerOptions) => {
  const auth = requirePerm('reader:view', '查看读者')
  if ('code' in auth) return auth

  const query = parseQuery(options.url)
  const page = Number(query.page || 1)
  const pageSize = Number(query.pageSize || 10)
  const name = query.name || ''
  const cardNo = query.cardNo || ''
  let list = [...db.readers]
  if (name) {
    list = list.filter((r) => r.name.includes(name))
  }
  if (cardNo) {
    list = list.filter((r) => r.cardNo.includes(cardNo))
  }
  return ok(paginate(list, page, pageSize))
})

// 新增读者：db.readerIdSeed++ 生成 id，phone/cardNo 缺省为空串，unshift 到头部。
Mock.mock('/api/reader/add', 'post', (options: MockHandlerOptions) => {
  const auth = requirePerm('reader:add', '新增读者')
  if ('code' in auth) return auth
  const user = auth.user
  const body = parseBody(options)
  const reader: ReaderItem = {
    id: db.readerIdSeed++,
    name: body.name,
    phone: body.phone || '',
    cardNo: body.cardNo || '',
    createTime: now(),
  }
  db.readers.unshift(reader)
  logOperation(user.nickname, '新增', `新增读者「${reader.name}」`)
  return ok(reader)
})

// 编辑读者：按 id 查找后覆盖 name/phone/cardNo。
Mock.mock('/api/reader/edit', 'post', (options: MockHandlerOptions) => {
  const auth = requirePerm('reader:edit', '编辑读者')
  if ('code' in auth) return auth
  const user = auth.user
  const body = parseBody(options)
  const reader = db.readers.find((r) => r.id === body.id)
  if (!reader) return fail('读者不存在', 404)
  reader.name = body.name
  reader.phone = body.phone || ''
  reader.cardNo = body.cardNo || ''
  logOperation(user.nickname, '编辑', `编辑读者「${reader.name}」`)
  return ok(reader)
})

// 删除读者：删除前校验该读者是否存在未归还借阅，有则拒绝（保证借阅数据一致性）。
Mock.mock('/api/reader/delete', 'post', (options: MockHandlerOptions) => {
  const auth = requirePerm('reader:delete', '删除读者')
  if ('code' in auth) return auth
  const user = auth.user
  const { id } = parseBody(options)
  const reader = db.readers.find((r) => r.id === id)
  if (!reader) return fail('读者不存在', 404)
  if (readerHasActiveBorrow(id)) {
    logOperation(user.nickname, '删除', `删除读者「${reader.name}」失败：存在未归还借阅`, '失败')
    return fail('该读者存在未归还借阅，不可删除')
  }
  db.readers = db.readers.filter((r) => r.id !== id)
  logOperation(user.nickname, '删除', `删除读者「${reader.name}」`)
  return ok(null)
})

// ==================== 角色权限接口（仅 admin） ====================
// 角色列表：仅管理员可访问（requireAdmin 守卫），按 name 模糊筛选 + 分页。
Mock.mock(/\/api\/role\/list/, 'get', (options: MockHandlerOptions) => {
  const auth = requireAdmin('查看角色管理')
  if ('code' in auth) return auth

  const query = parseQuery(options.url)
  const page = Number(query.page || 1)
  const pageSize = Number(query.pageSize || 10)
  const name = query.name || ''
  let list = [...db.roles]
  if (name) {
    list = list.filter((r) => r.name.includes(name))
  }
  return ok(paginate(list, page, pageSize))
})

// 保存角色（新增/编辑二合一）：body 带 id 走编辑分支，不带 id 走新增分支。
// 编辑时保护内置超级管理员角色——admin 的权限固定为 ['*']，不允许通过权限树修改。
Mock.mock('/api/role/save', 'post', (options: MockHandlerOptions) => {
  const auth = requireAdmin('操作角色')
  if ('code' in auth) return auth
  const user = auth.user

  const body = parseBody(options)
  if (body.id) {
    const role = db.roles.find((r) => r.id === body.id)
    if (!role) return fail('角色不存在', 404)
    // 保护内置超级管理员：权限固定为 ['*']，不可通过权限树修改
    if (role.name === 'admin') {
      logOperation(user.nickname, '授权', '修改角色「admin」失败：超级管理员权限不可修改', '失败')
      return fail('超级管理员角色权限不可修改')
    }
    role.name = body.name
    role.description = body.description
    role.permissions = body.permissions
    logOperation(user.nickname, '授权', `修改角色「${role.name}」权限`)
    return ok(role)
  }
  const role: RoleItem = {
    id: db.roleIdSeed++,
    name: body.name,
    description: body.description || '',
    permissions: body.permissions || [],
  }
  db.roles.push(role)
  logOperation(user.nickname, '新增', `新增角色「${role.name}」`)
  return ok(role)
})

// 删除角色：内置 admin 角色不可删除；被某个用户正在使用的角色也不可删除（否则这些用户会失去角色）。
Mock.mock('/api/role/delete', 'post', (options: MockHandlerOptions) => {
  const auth = requireAdmin('删除角色')
  if ('code' in auth) return auth
  const user = auth.user

  const { id } = parseBody(options)
  const role = db.roles.find((r) => r.id === id)
  if (!role) return fail('角色不存在', 404)
  if (role.name === 'admin') {
    logOperation(user.nickname, '删除', '删除角色「admin」失败：内置角色不可删除', '失败')
    return fail('超级管理员角色不可删除')
  }
  const inUse = db.users.some((u) => u.role === role.name)
  if (inUse) {
    logOperation(user.nickname, '删除', `删除角色「${role.name}」失败：正在被使用`, '失败')
    return fail(`角色「${role.name}」正在被用户使用，不可删除`, 500)
  }
  db.roles = db.roles.filter((r) => r.id !== id)
  logOperation(user.nickname, '删除', `删除角色「${role.name}」`)
  return ok(null)
})

// ==================== 用户管理接口（仅 admin） ====================
// 用户列表：按 username 模糊筛选 + 分页。返回时用 map 把 MockUser 转成 UserItem，
// 从而剔除 password 字段——密码绝不能返回给前端。
Mock.mock(/\/api\/user\/list/, 'get', (options: MockHandlerOptions) => {
  const auth = requireAdmin('查看用户管理')
  if ('code' in auth) return auth

  const query = parseQuery(options.url)
  const page = Number(query.page || 1)
  const pageSize = Number(query.pageSize || 10)
  const username = query.username || ''
  const list = db.users
    .filter((u) => !username || u.username.includes(username))
    .map((u): UserItem => ({ id: u.id, username: u.username, nickname: u.nickname, role: u.role, createTime: u.createTime }))
  return ok(paginate(list, page, pageSize))
})

// 新增用户：校验用户名/密码非空、用户名唯一；默认角色 lib，默认昵称取用户名。
Mock.mock('/api/user/add', 'post', (options: MockHandlerOptions) => {
  const auth = requireAdmin('新增用户')
  if ('code' in auth) return auth
  const user = auth.user
  const body = parseBody(options)
  if (!body.username || !body.password) return fail('用户名和密码不能为空')
  if (db.users.some((u) => u.username === body.username)) {
    logOperation(user.nickname, '新增', `新增用户「${body.username}」失败：用户名已存在`, '失败')
    return fail('用户名已存在')
  }
  const newUser: MockUser = {
    id: db.userIdSeed++,
    username: body.username,
    password: body.password,
    nickname: body.nickname || body.username,
    role: body.role || 'lib',
    createTime: now(),
  }
  db.users.push(newUser)
  logOperation(user.nickname, '新增', `新增用户「${newUser.username}」`)
  return ok({ id: newUser.id, username: newUser.username, nickname: newUser.nickname, role: newUser.role, createTime: newUser.createTime } as UserItem)
})

// 编辑用户：只允许改昵称和角色（密码另有专门的 reset 接口，不在这里改）。
Mock.mock('/api/user/edit', 'post', (options: MockHandlerOptions) => {
  const auth = requireAdmin('编辑用户')
  if ('code' in auth) return auth
  const user = auth.user
  const body = parseBody(options)
  const target = db.users.find((u) => u.id === body.id)
  if (!target) return fail('用户不存在', 404)
  target.nickname = body.nickname ?? target.nickname
  if (body.role) target.role = body.role
  logOperation(user.nickname, '编辑', `编辑用户「${target.username}」`)
  return ok({ id: target.id, username: target.username, nickname: target.nickname, role: target.role, createTime: target.createTime } as UserItem)
})

// 重置用户密码：管理员把某用户密码重置为指定值，未传则默认 123456。
Mock.mock('/api/user/reset', 'post', (options: MockHandlerOptions) => {
  const auth = requireAdmin('重置用户密码')
  if ('code' in auth) return auth
  const user = auth.user
  const body = parseBody(options)
  const target = db.users.find((u) => u.id === body.id)
  if (!target) return fail('用户不存在', 404)
  target.password = body.password || '123456'
  logOperation(user.nickname, '编辑', `重置用户「${target.username}」密码`)
  return ok(null)
})

// 删除用户：不能删除当前登录用户（否则会话立刻失效）、也不能删除内置 admin。
Mock.mock('/api/user/delete', 'post', (options: MockHandlerOptions) => {
  const auth = requireAdmin('删除用户')
  if ('code' in auth) return auth
  const user = auth.user
  const { id } = parseBody(options)
  const target = db.users.find((u) => u.id === id)
  if (!target) return fail('用户不存在', 404)
  if (target.id === user.id) return fail('不能删除当前登录用户')
  if (target.username === 'admin') return fail('不能删除内置超级管理员')
  db.users = db.users.filter((u) => u.id !== id)
  logOperation(user.nickname, '删除', `删除用户「${target.username}」`)
  return ok(null)
})

// ==================== 操作日志接口（仅 admin） ====================
// 操作日志列表：按操作人 operator、时间区间过滤 + 分页，仅管理员可看。
Mock.mock(/\/api\/log\/list/, 'get', (options: MockHandlerOptions) => {
  const auth = requireAdmin('查看操作日志')
  if ('code' in auth) return auth

  const query = parseQuery(options.url)
  const page = Number(query.page || 1)
  const pageSize = Number(query.pageSize || 10)
  const operator = query.operator || ''
  const startTime = query.startTime || ''
  const endTime = query.endTime || ''

  let list = [...db.operationLogs]
  if (operator) {
    list = list.filter((l) => l.operator.includes(operator))
  }
  if (startTime) {
    list = list.filter((l) => l.time >= startTime)
  }
  if (endTime) {
    list = list.filter((l) => l.time <= endTime)
  }
  return ok(paginate(list, page, pageSize))
})

// 记录一条操作日志（供导出等纯前端动作上报）
// 说明：本接口只要求登录、不校验具体权限码，主要用于把"导出"这类只发生在前端、
// 后端本身感知不到的动作也写入操作日志，保证审计完整性。
Mock.mock('/api/log/record', 'post', (options: MockHandlerOptions) => {
  const user = getCurrentUser()
  if (!user) return fail('未登录或登录已失效', 401)
  const body = parseBody(options)
  logOperation(user.nickname, body.type, body.description)
  return ok(null)
})

export { fullMenus }
