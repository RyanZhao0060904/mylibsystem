import type { BookItem, BorrowRecord, OperationLog, ReaderItem, RoleItem } from '@/types'

// ==================== 文件说明 ====================
// 本文件是整个 mock 后端的"内存数据库"：用一个普通对象 db 来模拟后端各张数据表。
// 所有数据只存在于浏览器内存中，页面刷新即重置为这里的初始值，非常适合课程设计阶段脱离真实后端跑通全流程。
// db 的每个字段对应一张"表"：
//   users 用户、roles 角色、readers 读者、books 图书、borrows 借阅记录、operationLogs 操作日志，
// 末尾还带了一批"自增 id 种子"，用来在没有数据库自增主键时手动生成新记录的主键 id。

/** mock 用户（含密码，密码仅存在于 mock 层） */
export interface MockUser {
  id: number
  username: string
  password: string
  nickname: string
  role: string
  createTime: string
}

// 说明：MockUser 是 mock 层专用的用户类型，比前端业务类型 UserItem 多了 password 字段。
// 后续 user/list 等接口返回给前端时，会用 map 把 MockUser 转成 UserItem，从而剔除密码、避免密码泄露到前端。

/** 全局 mock 数据仓库（属性可整体重赋值，兼容 filter/增删改） */
// 为什么用 const 声明还能增删改？—— db 本身是 const（引用不变），但它的数组属性会被"整体替换"
// （例如 db.books = db.books.filter(...)），filter/增删改都生成新数组再赋回，所以属性可以被重新赋值。
export const db = {
  // users 用户表：username 登录名、password 明文密码（仅 mock 演示用，真实后端会加密存储）、
  // role 为角色名（admin 超级管理员 / lib 图书馆管理员），createTime 创建时间。
  users: [
    { id: 1, username: 'admin', password: '123456', nickname: '超级管理员', role: 'admin', createTime: '2026-01-01 09:00:00' },
    { id: 2, username: 'lib', password: '123456', nickname: '图书馆管理员', role: 'lib', createTime: '2026-01-01 09:00:00' },
  ] as MockUser[],

  // roles 角色表：permissions 是权限码数组，是 RBAC（基于角色的访问控制）的核心。
  // admin 用 ['*'] 通配符表示"拥有全部权限"；lib 则逐条列出图书/借阅/读者相关的具体权限码，
  // 前端菜单和按钮据此判断是否显示（最小权限原则）。
  roles: [
    { id: 1, name: 'admin', description: '超级管理员，拥有全部权限', permissions: ['*'] },
    {
      id: 2,
      name: 'lib',
      description: '图书馆管理员，负责图书、借阅与读者管理',
      permissions: [
        'book:view',
        'book:add',
        'book:edit',
        'book:delete',
        'book:batchDelete',
        'book:export',
        'borrow:view',
        'borrow:add',
        'borrow:return',
        'borrow:renew',
        'borrow:delete',
        'reader:view',
        'reader:add',
        'reader:edit',
        'reader:delete',
      ],
    },
  ] as RoleItem[],

  // readers 读者表：读者是借书的主体，cardNo 借书证号（唯一标识）、phone 联系电话。
  readers: [
    { id: 1, name: '张三', phone: '13800000001', cardNo: 'R20260001', createTime: '2026-08-01 09:00:00' },
    { id: 2, name: '李四', phone: '13800000002', cardNo: 'R20260002', createTime: '2026-08-02 09:00:00' },
    { id: 3, name: '王五', phone: '13800000003', cardNo: 'R20260003', createTime: '2026-08-03 09:00:00' },
    { id: 4, name: '赵六', phone: '13800000004', cardNo: 'R20260004', createTime: '2026-08-04 09:00:00' },
    { id: 5, name: '孙七', phone: '13800000005', cardNo: 'R20260005', createTime: '2026-08-05 09:00:00' },
    { id: 6, name: '周八', phone: '13800000006', cardNo: 'R20260006', createTime: '2026-08-06 09:00:00' },
    { id: 7, name: '吴九', phone: '13800000007', cardNo: 'R20260007', createTime: '2026-08-07 09:00:00' },
  ] as ReaderItem[],

  // books 图书表：status 是库存的展示状态（在库/借出），由 stock 推导而来，二者始终一致（见 index.ts 的 syncBookStatus）。
  // price 单价、callNumber 索书号、isbn 国际标准书号、cover 封面图 URL。
  books: [
    { id: 1, name: '深入理解计算机系统', author: '兰德尔·布莱恩特', isbn: '978-7-111-54493-7', publisher: '机械工业出版社', publishDate: '2016-01-01', price: 139, callNumber: 'TP3/1001', category: '计算机', status: '在库', stock: 5, cover: '', description: '从程序员视角系统讲解计算机系统底层原理。', createTime: '2026-08-01 09:00:00' },
    { id: 2, name: '算法导论', author: '托马斯·科尔曼', isbn: '978-7-111-18777-6', publisher: '机械工业出版社', publishDate: '2009-10-01', price: 128, callNumber: 'TP301.6/1002', category: '计算机', status: '在库', stock: 3, cover: '', description: '算法领域的经典教材，覆盖常用算法设计与分析。', createTime: '2026-08-02 09:00:00' },
    { id: 3, name: 'JavaScript 高级程序设计', author: '马特·弗里斯比', isbn: '978-7-115-54063-4', publisher: '人民邮电出版社', publishDate: '2020-09-01', price: 129, callNumber: 'TP312/1003', category: '计算机', status: '借出', stock: 0, cover: '', description: '全面讲解 JavaScript 语言核心与浏览器 API。', createTime: '2026-08-03 09:00:00' },
    { id: 4, name: '三体', author: '刘慈欣', isbn: '978-7-5366-9293-0', publisher: '重庆出版社', publishDate: '2008-01-01', price: 23, callNumber: 'I247.5/2001', category: '文学', status: '在库', stock: 8, cover: '', description: '中国科幻文学的里程碑之作。', createTime: '2026-08-04 09:00:00' },
    { id: 5, name: '活着', author: '余华', isbn: '978-7-5063-6543-1', publisher: '作家出版社', publishDate: '2012-08-01', price: 28, callNumber: 'I247.5/2002', category: '文学', status: '在库', stock: 5, cover: '', description: '讲述一个人在时代洪流中坚韧活着的故事。', createTime: '2026-08-05 09:00:00' },
    { id: 6, name: '百年孤独', author: '加西亚·马尔克斯', isbn: '978-7-5442-5400-4', publisher: '南海出版公司', publishDate: '2011-06-01', price: 39, callNumber: 'I775.45/2003', category: '文学', status: '借出', stock: 0, cover: '', description: '魔幻现实主义文学的代表作。', createTime: '2026-08-06 09:00:00' },
    { id: 7, name: '明朝那些事儿', author: '当年明月', isbn: '978-7-5057-3729-9', publisher: '中国友谊出版公司', publishDate: '2011-11-01', price: 298, callNumber: 'K248/3001', category: '历史', status: '在库', stock: 4, cover: '', description: '以通俗幽默的语言讲述明朝三百年历史。', createTime: '2026-08-07 09:00:00' },
    { id: 8, name: '万历十五年', author: '黄仁宇', isbn: '978-7-101-07226-0', publisher: '中华书局', publishDate: '2006-08-01', price: 26, callNumber: 'K248/3002', category: '历史', status: '在库', stock: 2, cover: '', description: '以大历史观剖析明代社会制度。', createTime: '2026-08-08 09:00:00' },
    { id: 9, name: '时间简史', author: '史蒂芬·霍金', isbn: '978-7-5357-7835-5', publisher: '湖南科学技术出版社', publishDate: '2010-04-01', price: 45, callNumber: 'P159/4001', category: '科技', status: '在库', stock: 7, cover: '', description: '探索宇宙起源与时空奥秘的科普经典。', createTime: '2026-08-09 09:00:00' },
    { id: 10, name: '人类简史', author: '尤瓦尔·赫拉利', isbn: '978-7-5086-4735-7', publisher: '中信出版社', publishDate: '2014-11-01', price: 68, callNumber: 'K02/4002', category: '科技', status: '借出', stock: 0, cover: '', description: '从认知革命到科技革命的人类发展史。', createTime: '2026-08-10 09:00:00' },
    { id: 11, name: '艺术的故事', author: '贡布里希', isbn: '978-7-80747-927-9', publisher: '广西美术出版社', publishDate: '2012-06-01', price: 280, callNumber: 'J110.9/5001', category: '艺术', status: '在库', stock: 3, cover: '', description: '最经典的艺术通史入门读物。', createTime: '2026-08-11 09:00:00' },
    { id: 12, name: '美的历程', author: '李泽厚', isbn: '978-7-108-03037-4', publisher: '生活·读书·新知三联书店', publishDate: '2009-07-01', price: 36, callNumber: 'J01/5002', category: '艺术', status: '在库', stock: 5, cover: '', description: '中国美学与艺术的巡礼。', createTime: '2026-08-12 09:00:00' },
  ] as BookItem[],

  // 借阅记录（readerId 对应 readers；dueDate 为应还日期；王五那条已逾期用于演示）
  // borrows 借阅记录表：一条记录代表"某读者借了某本书"，是借还业务的核心数据。
  //   status 状态机：借阅中 → 已归还（续借只延长 dueDate 并 renewCount+1，状态不变）。
  //   returnTime 为空表示尚未归还；renewCount 续借次数（系统限制最多续借 1 次）。
  //   bookName / borrower 是冗余字段，直接存名字，方便列表展示时无需再关联查询图书/读者表。
  borrows: [
    { id: 1, bookId: 3, bookName: 'JavaScript 高级程序设计', readerId: 1, borrower: '张三', borrowTime: '2026-09-01 10:00:00', dueDate: '2026-10-01 10:00:00', returnTime: '', renewCount: 0, status: '借阅中' },
    { id: 2, bookId: 6, bookName: '百年孤独', readerId: 2, borrower: '李四', borrowTime: '2026-09-02 14:30:00', dueDate: '2026-10-02 14:30:00', returnTime: '', renewCount: 0, status: '借阅中' },
    { id: 3, bookId: 10, bookName: '人类简史', readerId: 3, borrower: '王五', borrowTime: '2026-09-03 09:15:00', dueDate: '2026-09-10 09:15:00', returnTime: '', renewCount: 0, status: '借阅中' },
    { id: 4, bookId: 5, bookName: '活着', readerId: 4, borrower: '赵六', borrowTime: '2026-09-05 08:30:00', dueDate: '2026-10-05 08:30:00', returnTime: '', renewCount: 0, status: '借阅中' },
    { id: 5, bookId: 2, bookName: '算法导论', readerId: 5, borrower: '孙七', borrowTime: '2026-08-20 16:00:00', dueDate: '2026-09-19 16:00:00', returnTime: '2026-08-25 10:00:00', renewCount: 0, status: '已归还' },
    { id: 6, bookId: 4, bookName: '三体', readerId: 6, borrower: '周八', borrowTime: '2026-08-18 11:00:00', dueDate: '2026-09-17 11:00:00', returnTime: '2026-08-22 15:00:00', renewCount: 0, status: '已归还' },
    { id: 7, bookId: 9, bookName: '时间简史', readerId: 7, borrower: '吴九', borrowTime: '2026-08-15 15:45:00', dueDate: '2026-09-14 15:45:00', returnTime: '2026-08-20 09:30:00', renewCount: 0, status: '已归还' },
  ] as BorrowRecord[],

  // operationLogs 操作日志表：记录登录/登出/增删改/越权等关键动作，供"操作日志"页面审计回溯。
  // type 为动作类型、result 成功/失败、description 详情描述。
  operationLogs: [
    { id: 1, operator: '超级管理员', time: '2026-09-12 09:00:00', description: '登录系统', type: '登录', result: '成功' },
  ] as OperationLog[],

  // 自增 id —— 内存数据库没有真正的自增主键，这里用"种子变量"手动模拟：
  // 每次新增记录时取当前种子值作为新记录的 id，然后 +1（用法见 index.ts 里的 db.bookIdSeed++ 等）。
  // 初始值设为 100，是为了和上面预置的手工 id（1、2、3…）错开，避免新记录与旧记录 id 冲突。
  bookIdSeed: 100,
  roleIdSeed: 10,
  logIdSeed: 100,
  readerIdSeed: 100,
  userIdSeed: 100,
  borrowIdSeed: 100,
}
