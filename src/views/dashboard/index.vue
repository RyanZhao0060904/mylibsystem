<script setup lang="ts">
// ================================================================
// 仪表盘 / 首页
// 聚合「图书」和「借阅」两类数据，展示：
//   1. 热门图书轮播图（封面 + 简介）
//   2. 六张统计数字卡片
//   3. 三张 ECharts 图表（分类饼图 / 借阅状态柱状图 / 热门图书 TOP5 横向柱状图）
//   4. 三个工作台列表（到期提醒 / 库存预警 / 最近借阅动态）
//
// 整体流程：进入页面时 loadData() 一次性拉全量数据并做统计，
//           然后 renderCharts() 把统计结果画到图表里。
// ================================================================
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import * as echarts from 'echarts'
import { getBookList } from '@/api/book'
import { getBorrowList } from '@/api/borrow'
import type { BookItem, BorrowRecord } from '@/types'

// ============ 统计数据 ============
// 六张数字卡片对应的数值。用 reactive 包裹，方便统一维护和响应式更新
const stats = reactive({
  bookTotal: 0,    // 图书总数
  inStock: 0,      // 在库图书
  borrowed: 0,     // 借出图书
  borrowTotal: 0,  // 借阅记录总数
  borrowActive: 0, // 当前借阅中
  overdue: 0,      // 逾期借阅
})

// 统计卡片配置：label 标题 / value 数值 / icon 图标名 / color 图标颜色。
// 用 computed 包裹是因为它依赖 stats —— stats 变化时这里会自动重算，模板随之刷新
const statCards = computed(() => [
  { label: '图书总数', value: stats.bookTotal, icon: 'Notebook', color: '#8b5e3c' },
  { label: '在库图书', value: stats.inStock, icon: 'Box', color: '#5d7a4f' },
  { label: '借出图书', value: stats.borrowed, icon: 'Reading', color: '#c98a3b' },
  { label: '借阅总数', value: stats.borrowTotal, icon: 'Tickets', color: '#7a6f5c' },
  { label: '借阅中', value: stats.borrowActive, icon: 'Clock', color: '#a64b3c' },
  { label: '逾期借阅', value: stats.overdue, icon: 'Warning', color: '#b3392f' },
])

// 三张图表的数据源，都是 { name, value } 数组 —— 这是 ECharts 直接能消费的结构
const categoryData = ref<{ name: string; value: number }[]>([])    // 图书分类分布（饼图）
const borrowStatusData = ref<{ name: string; value: number }[]>([]) // 借阅状态统计（柱状图）
const topBooksData = ref<{ name: string; value: number }[]>([])    // 热门图书 TOP5（横向柱状图）

// 热门图书轮播数据：除了借阅次数，还要带完整图书信息（封面 / 简介）供轮播展示
interface HotBook {
  book: BookItem
  count: number // 该书累计被借阅的次数
}
const hotBooks = ref<HotBook[]>([])

// 轮播图在「没有封面」时用的渐变占位底色（5 种复古色调按顺序循环使用）
const coverPalettes = [
  'linear-gradient(135deg, #8b5e3c 0%, #4a3728 100%)',
  'linear-gradient(135deg, #5d6b53 0%, #2f3b2e 100%)',
  'linear-gradient(135deg, #7a4f3f 0%, #3a2a22 100%)',
  'linear-gradient(135deg, #4a5a6a 0%, #253039 100%)',
  'linear-gradient(135deg, #9b7b4f 0%, #5a4a2e 100%)',
]

// ============ 工作台三个列表 ============
const dueReminders = ref<BorrowRecord[]>([])   // 到期提醒：未归还（借阅中 / 逾期）的记录
const lowStockBooks = ref<BookItem[]>([])     // 库存预警：库存 ≤ 2 的图书
const recentBorrows = ref<BorrowRecord[]>([]) // 最近借阅动态

// 把借阅状态映射成 Element Plus 标签的类型（success=绿 / danger=红 / warning=橙）
function borrowStatusType(status: string) {
  if (status === '已归还') return 'success'
  if (status === '已逾期') return 'danger'
  return 'warning'
}

// ============ 图表 ============
// ECharts 必须绑定到一个真实的 DOM 元素，这里用 ref 关联模板里的 <div>
const pieRef = ref<HTMLDivElement>()    // 饼图容器
const barRef = ref<HTMLDivElement>()    // 借阅状态柱状图容器
const topBarRef = ref<HTMLDivElement>() // 热门图书横向柱状图容器

// 保存三张图表的 ECharts 实例，供「窗口缩放 resize」和「组件卸载 dispose」使用
let pieChart: echarts.ECharts | null = null
let barChart: echarts.ECharts | null = null
let topBarChart: echarts.ECharts | null = null

// 拉取全量数据并计算所有统计结果，只在进入页面时调用一次
async function loadData() {
  // Promise.all 让两个请求并行发出，比先后串行更快
  const [bookRes, borrowRes] = await Promise.all([
    getBookList({ page: 1, pageSize: 99999 }), // pageSize 传超大值 = 不分页、取全部
    getBorrowList({ page: 1, pageSize: 99999 }),
  ])
  const books = bookRes.list
  const borrows = borrowRes.list

  // —— 统计卡片：用 filter 按条件计数 ——
  stats.bookTotal = books.length
  stats.inStock = books.filter((b) => b.status === '在库').length
  stats.borrowed = books.filter((b) => b.status === '借出').length
  stats.borrowTotal = borrows.length
  stats.borrowActive = borrows.filter((b) => b.status === '借阅中').length
  stats.overdue = borrows.filter((b) => b.status === '已逾期').length

  // —— 图书分类统计（饼图）——
  // 用 Map 按「分类名」累加数量，最后转成 ECharts 需要的 { name, value } 数组
  const catMap = new Map<string, number>()
  books.forEach((b) => catMap.set(b.category, (catMap.get(b.category) ?? 0) + 1))
  categoryData.value = [...catMap.entries()].map(([name, value]) => ({ name, value }))

  // —— 借阅状态统计（柱状图）——
  borrowStatusData.value = [
    { name: '借阅中', value: borrows.filter((b) => b.status === '借阅中').length },
    { name: '已归还', value: borrows.filter((b) => b.status === '已归还').length },
    { name: '已逾期', value: borrows.filter((b) => b.status === '已逾期').length },
  ]

  // —— 热门图书（轮播 + TOP5 柱状图共用同一份数据）——
  // 按 bookId 累加每本书的借阅次数，降序取前 5
  const countMap = new Map<number, number>()
  borrows.forEach((b) => countMap.set(b.bookId, (countMap.get(b.bookId) ?? 0) + 1))
  hotBooks.value = [...countMap.entries()]
    .sort((a, b) => b[1] - a[1]) // 按借阅次数降序排列
    .slice(0, 5)                 // 只取前 5 名
    .map(([bookId, count]) => ({ book: books.find((x) => x.id === bookId), count }))
    .filter((h): h is HotBook => !!h.book) // 过滤掉找不到图书信息的脏数据
  topBooksData.value = hotBooks.value.map((h) => ({ name: h.book.name, value: h.count }))

  // —— 到期提醒 ——
  // 未归还（借阅中 / 逾期）的记录，按应还日期升序（越快到期的越靠前），取前 5
  dueReminders.value = borrows
    .filter((b) => b.status !== '已归还')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 5)

  // —— 库存预警 ——
  // 库存 ≤ 2 的书，按库存升序（最缺的排最前），取前 5
  lowStockBooks.value = books
    .filter((b) => b.stock <= 2)
    .sort((a, b) => a.stock - b.stock)
    .slice(0, 5)

  // —— 最近借阅动态 ——
  // 按借阅时间倒序（最新的在前），取前 6
  recentBorrows.value = [...borrows]
    .sort((a, b) => b.borrowTime.localeCompare(a.borrowTime))
    .slice(0, 6)
}

// 把统计结果画到三张 ECharts 图表里
function renderCharts() {
  // —— 饼图：图书分类分布 ——
  if (pieRef.value) {
    pieChart = echarts.init(pieRef.value) // 绑定 DOM 并创建实例
    pieChart.setOption({
      tooltip: { trigger: 'item' }, // 悬停某个扇区时弹出提示框
      legend: { bottom: 0 },        // 图例放在底部
      color: ['#8b5e3c', '#5d7a4f', '#c98a3b', '#a64b3c', '#4a5a6a'],
      series: [
        {
          name: '图书分类',
          type: 'pie',
          radius: ['38%', '62%'],   // 内半径 38% + 外半径 62% = 环形图（不是实心饼）
          center: ['50%', '45%'],   // 圆心位置
          itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
          label: { show: true, formatter: '{b}: {c}' }, // 扇区上显示「分类: 数量」
          data: categoryData.value,
        },
      ],
    })
  }

  // —— 柱状图：借阅状态统计 ——
  if (barRef.value) {
    barChart = echarts.init(barRef.value)
    barChart.setOption({
      tooltip: { trigger: 'axis' }, // 悬停某根柱子时按坐标轴触发提示
      grid: { left: 40, right: 20, top: 30, bottom: 30 }, // 图表四周留白
      xAxis: { type: 'category', data: borrowStatusData.value.map((d) => d.name) }, // 横轴=三个状态名
      yAxis: { type: 'value', minInterval: 1 }, // 纵轴=数量，刻度按整数递增
      series: [
        {
          name: '数量',
          type: 'bar',
          barWidth: '42%',
          color: '#8b5e3c',
          itemStyle: { borderRadius: [4, 4, 0, 0] }, // 柱子顶部圆角
          data: borrowStatusData.value.map((d) => d.value),
        },
      ],
    })
  }

  // —— 横向柱状图：热门图书 TOP5 ——
  if (topBarRef.value) {
    topBarChart = echarts.init(topBarRef.value)
    topBarChart.setOption({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 100, right: 40, top: 10, bottom: 30 }, // 左边留 100 给书名
      xAxis: { type: 'value', minInterval: 1 },            // 横轴=借阅次数
      yAxis: { type: 'category', data: topBooksData.value.map((d) => d.name), inverse: true }, // 纵轴=书名，inverse 让第一名排最上面
      series: [
        {
          name: '借阅次数',
          type: 'bar',
          barWidth: '50%',
          color: '#8b5e3c',
          itemStyle: { borderRadius: [0, 4, 4, 0] }, // 柱子右侧圆角
          data: topBooksData.value.map((d) => d.value),
        },
      ],
    })
  }
}

// 窗口大小变化时，通知三张图表自适应重绘，避免被拉伸变形
function handleResize() {
  pieChart?.resize()
  barChart?.resize()
  topBarChart?.resize()
}

// 进入页面：先加载数据 → 等模板渲染出容器 DOM → 再画图
onMounted(async () => {
  await loadData()
  await nextTick() // nextTick 保证 <div ref="..."> 已渲染完成，否则图表拿不到容器
  renderCharts()
  window.addEventListener('resize', handleResize)
})

// 离开页面：移除事件监听、销毁图表实例，防止内存泄漏
onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  pieChart?.dispose()
  barChart?.dispose()
  topBarChart?.dispose()
})
</script>

<template>
  <div class="dashboard">
    <!-- 1. 热门图书轮播：有热门书才显示 -->
    <el-carousel
      v-if="hotBooks.length"
      height="200px"
      :interval="4000"
      arrow="always"
      class="hot-carousel"
    >
      <el-carousel-item v-for="(h, i) in hotBooks" :key="h.book.id">
        <div class="hot-slide" :style="{ background: coverPalettes[i % coverPalettes.length] }">
          <div class="hot-cover">
            <img v-if="h.book.cover" :src="h.book.cover" :alt="h.book.name" />
            <el-icon v-else :size="44" color="rgba(255,255,255,0.85)"><Reading /></el-icon>
          </div>
          <div class="hot-info">
            <div class="hot-rank">TOP {{ i + 1 }}</div>
            <div class="hot-name">{{ h.book.name }}</div>
            <div class="hot-meta">{{ h.book.author }} · {{ h.book.category }}</div>
            <div v-if="h.book.description" class="hot-desc">{{ h.book.description }}</div>
            <div class="hot-count">累计借阅 {{ h.count }} 次</div>
          </div>
        </div>
      </el-carousel-item>
    </el-carousel>

    <!-- 2. 统计数字卡片：循环 statCards 渲染，xs/sm/md 控制不同屏宽的占位 -->
    <el-row :gutter="16">
      <el-col v-for="card in statCards" :key="card.label" :xs="12" :sm="12" :md="8">
        <el-card shadow="hover" class="stat-card">
          <div class="flex-between">
            <div>
              <div class="stat-value">{{ card.value }}</div>
              <div class="stat-label">{{ card.label }}</div>
            </div>
            <!-- component :is 动态渲染图标（图标名来自 card.icon 字符串） -->
            <el-icon :size="36" :color="card.color">
              <component :is="card.icon" />
            </el-icon>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 3. 图表：前两张并排，各占一半 -->
    <el-row :gutter="16" class="chart-row">
      <el-col :xs="24" :md="12">
        <el-card shadow="never" header="图书分类分布">
          <div ref="pieRef" class="chart" />
        </el-card>
      </el-col>
      <el-col :xs="24" :md="12">
        <el-card shadow="never" header="借阅状态统计">
          <div ref="barRef" class="chart" />
        </el-card>
      </el-col>
    </el-row>

    <!-- 热门图书 TOP5 单独占一整行 -->
    <el-row :gutter="16" class="chart-row">
      <el-col :span="24">
        <el-card shadow="never" header="热门图书 TOP5">
          <div ref="topBarRef" class="chart chart-short" />
        </el-card>
      </el-col>
    </el-row>

    <!-- 4. 工作台三个列表，各占三分之一 -->
    <el-row :gutter="16" class="chart-row">
      <el-col :xs="24" :md="8">
        <el-card shadow="never" header="到期提醒（待归还 / 逾期）" class="workbench-card">
          <ul class="remind-list">
            <li v-for="b in dueReminders" :key="b.id" class="remind-item">
              <div class="remind-main">
                <span class="remind-book">{{ b.bookName }}</span>
                <span class="remind-borrower">{{ b.borrower }}</span>
              </div>
              <div class="remind-sub">
                <span class="remind-time">应还 {{ b.dueDate.slice(0, 10) }}</span>
                <el-tag :type="borrowStatusType(b.status)" size="small">{{ b.status }}</el-tag>
              </div>
            </li>
            <li v-if="!dueReminders.length" class="empty">暂无待归还借阅</li>
          </ul>
        </el-card>
      </el-col>

      <el-col :xs="24" :md="8">
        <el-card shadow="never" header="库存预警（库存 ≤ 2）" class="workbench-card">
          <ul class="remind-list">
            <li v-for="b in lowStockBooks" :key="b.id" class="remind-item">
              <div class="remind-main">
                <span class="remind-book">{{ b.name }}</span>
                <span class="remind-stock" :class="{ zero: b.stock === 0 }">库存 {{ b.stock }}</span>
              </div>
              <div class="remind-sub">
                <span class="remind-time">{{ b.category }}</span>
              </div>
            </li>
            <li v-if="!lowStockBooks.length" class="empty">暂无库存不足的图书</li>
          </ul>
        </el-card>
      </el-col>

      <el-col :xs="24" :md="8">
        <el-card shadow="never" header="最近借阅动态" class="workbench-card">
          <ul class="remind-list">
            <li v-for="b in recentBorrows" :key="b.id" class="remind-item">
              <div class="remind-main">
                <span class="remind-book">{{ b.bookName }}</span>
                <span class="remind-borrower">{{ b.borrower }}</span>
              </div>
              <div class="remind-sub">
                <span class="remind-time">{{ b.borrowTime.slice(0, 16) }}</span>
                <el-tag :type="borrowStatusType(b.status)" size="small">{{ b.status }}</el-tag>
              </div>
            </li>
            <li v-if="!recentBorrows.length" class="empty">暂无借阅记录</li>
          </ul>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.hot-carousel {
  margin-bottom: 16px;
  border-radius: 10px;
  overflow: hidden;
}

.hot-slide {
  height: 100%;
  display: flex;
  align-items: center;
  padding: 0 56px;
  color: #fff;
}

.hot-cover {
  width: 110px;
  height: 150px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 8px;
  overflow: hidden;
}

.hot-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.hot-info {
  margin-left: 32px;
}

.hot-rank {
  font-size: 13px;
  letter-spacing: 1px;
  opacity: 0.85;
}

.hot-name {
  font-size: 26px;
  font-weight: 700;
  margin: 8px 0 12px;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
}

.hot-meta {
  font-size: 14px;
  opacity: 0.9;
}

.hot-desc {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.5;
  opacity: 0.85;
  max-width: 640px;
  /* 两行截断，超出显示省略号 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.hot-count {
  margin-top: 12px;
  font-size: 13px;
  opacity: 0.85;
}

.stat-card {
  margin-bottom: 16px;
}

.stat-value {
  font-size: 26px;
  font-weight: 700;
  color: #303133;
}

.stat-label {
  margin-top: 6px;
  color: #909399;
  font-size: 13px;
}

.chart-row {
  margin-top: 4px;
}

.chart {
  height: 320px;
}

.chart-short {
  height: 260px;
}

.workbench-card {
  margin-bottom: 16px;
}

.remind-list {
  list-style: none;
  margin: 0;
  padding: 0;
  min-height: 220px;
}

.remind-item {
  padding: 10px 4px;
  border-bottom: 1px dashed #ebeef5;
}

.remind-item:last-child {
  border-bottom: none;
}

.remind-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.remind-book {
  color: #303133;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.remind-borrower {
  color: #606266;
  font-size: 13px;
  flex-shrink: 0;
  margin-left: 8px;
}

.remind-sub {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
}

.remind-time {
  color: #909399;
  font-size: 12px;
}

.remind-stock {
  color: #e6a23c;
  font-size: 13px;
  flex-shrink: 0;
}

.remind-stock.zero {
  color: #f56c6c;
  font-weight: 600;
}

.empty {
  color: #c0c4cc;
  font-size: 13px;
  text-align: center;
  padding: 60px 0;
}
</style>
