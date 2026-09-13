<script setup lang="ts">
// onMounted：组件挂载后立即加载第一页数据；reactive / ref：响应式状态
import { onMounted, reactive, ref } from 'vue'
// useRouter：跳转详情页用
import { useRouter } from 'vue-router'
// ElMessage 轻提示 / ElMessageBox 二次确认弹框
import { ElMessage, ElMessageBox } from 'element-plus'
// 图书相关接口：列表、新增、删除、编辑、批量删除
import { addBook, batchDeleteBooks, deleteBook, editBook, getBookList } from '@/api/book'
// recordLog：导出操作时写一条操作日志
import { recordLog } from '@/api/log'
// 分类、状态等下拉选项常量
import { BOOK_CATEGORIES, BOOK_STATUSES } from '@/constants'
// exportCsv：把数据导出为 CSV 文件；CsvColumn 定义列的映射关系
import { exportCsv, type CsvColumn } from '@/utils/csv'
import type { BookItem } from '@/types'
// 新增/编辑共用的弹窗表单组件
import BookForm from './components/BookForm.vue'

const router = useRouter()

// ============ 列表 / 分页 ============
const loading = ref(false)
const tableData = ref<BookItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)

// ============ 筛选条件 ============
const filters = reactive({
  name: '',
  category: '',
  status: '',
})

// ============ 多选 ============
const selection = ref<BookItem[]>([])

// ============ 弹窗 ============
const dialogVisible = ref(false)
const editingBook = ref<BookItem | null>(null)

// 拉取列表数据：把当前页码、每页条数和筛选条件一起传给后端
async function fetchList() {
  loading.value = true
  try {
    // 空字符串筛选条件转成 undefined，避免把空串传给后端导致筛选逻辑异常
    const res = await getBookList({
      page: page.value,
      pageSize: pageSize.value,
      name: filters.name || undefined,
      category: filters.category || undefined,
      status: filters.status || undefined,
    })
    tableData.value = res.list
    total.value = res.total
  } finally {
    // 无论成功失败都要关闭表格 loading
    loading.value = false
  }
}

// 查询：条件变了要从第一页开始查，否则可能停留在越界的旧页码
function handleSearch() {
  page.value = 1
  fetchList()
}

// 重置：清空所有筛选条件并回到第一页重新加载
function handleReset() {
  filters.name = ''
  filters.category = ''
  filters.status = ''
  page.value = 1
  fetchList()
}

// 表格多选变化时把选中的行存起来，供批量删除读取
function handleSelectionChange(rows: BookItem[]) {
  selection.value = rows
}

// ============ 新增 / 编辑 ============
// 新增：editingBook 置空，表示 BookForm 进入「新增」模式
function openAdd() {
  editingBook.value = null
  dialogVisible.value = true
}

// 编辑：把当前行数据传入 BookForm，BookForm 据此进入「编辑」模式并回显
function openEdit(row: BookItem) {
  editingBook.value = row
  dialogVisible.value = true
}

// 保存回调：由 BookForm 提交时触发，根据是否有编辑对象区分「改」还是「增」
async function handleSave(data: Partial<BookItem>) {
  if (editingBook.value) {
    // 编辑：把表单数据与记录 id 合并后提交
    await editBook({ ...data, id: editingBook.value.id })
    ElMessage.success('编辑成功')
  } else {
    await addBook(data)
    ElMessage.success('新增成功')
  }
  dialogVisible.value = false
  fetchList()
}

// ============ 删除 ============
/** 删除后页码越界处理：当前页 > 总页数则重置 page */
// 为什么处理越界：比如当前在第 3 页，删除后数据只剩 2 页，若仍请求第 3 页会得到空列表，
// 因此先按剩余总数算出最大页码，当前页超过它就拉回最大页，避免出现「空白页」
async function refreshAfterDelete(deletedCount: number) {
  const newTotal = total.value - deletedCount
  const maxPage = Math.max(1, Math.ceil(newTotal / pageSize.value))
  if (page.value > maxPage) page.value = maxPage
  await fetchList()
}

// 单条删除：先用 ElMessageBox 二次确认，防止误删
async function handleDelete(row: BookItem) {
  try {
    // confirm 返回 Promise：点「确定」resolve，点「取消」或关闭弹框 reject
    await ElMessageBox.confirm(`确定要删除图书《${row.name}》吗？`, '删除确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    // 用户取消/关闭弹框会走这里，直接结束，不执行删除
    return
  }
  await deleteBook(row.id)
  ElMessage.success('删除成功')
  // 删除后刷新列表，并处理可能的页码越界（参数 1 表示删了 1 条）
  refreshAfterDelete(1)
}

// 批量删除：把表格多选的行 id 收集起来一次性提交，删除条数 = 选中条数
async function handleBatchDelete() {
  // 未勾选数据：提示，不发起请求
  if (selection.value.length === 0) {
    ElMessage.warning('请选择数据')
    return
  }
  try {
    await ElMessageBox.confirm(`确定要删除选中的 ${selection.value.length} 本图书吗？`, '批量删除确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    // 用户取消二次确认，直接返回
    return
  }
  const ids = selection.value.map((item) => item.id)
  await batchDeleteBooks(ids)
  ElMessage.success('批量删除成功')
  // 传入删除条数，用于正确计算剩余页数并处理页码越界
  refreshAfterDelete(ids.length)
}

// ============ 导出 CSV（HTML5 Blob） ============
// CSV 列定义：title 是表头显示的文字，key 对应数据对象里的字段名
const csvColumns: CsvColumn<BookItem>[] = [
  { title: 'ID', key: 'id' },
  { title: '书名', key: 'name' },
  { title: '作者', key: 'author' },
  { title: 'ISBN', key: 'isbn' },
  { title: '出版社', key: 'publisher' },
  { title: '出版日期', key: 'publishDate' },
  { title: '价格', key: 'price' },
  { title: '索书号', key: 'callNumber' },
  { title: '分类', key: 'category' },
  { title: '状态', key: 'status' },
  { title: '库存', key: 'stock' },
  { title: '简介', key: 'description' },
  { title: '创建时间', key: 'createTime' },
]

// 导出 CSV：不带分页，直接把「当前筛选条件下」的所有数据一次性查出来
async function handleExport() {
  // pageSize 传一个极大值模拟「查全部」，配合前端内存 mock 拿到全量数据
  const res = await getBookList({
    page: 1,
    pageSize: 99999,
    name: filters.name || undefined,
    category: filters.category || undefined,
    status: filters.status || undefined,
  })
  if (res.list.length === 0) {
    ElMessage.warning('没有可导出的数据')
    return
  }
  // 文件名带当天日期，方便区分不同批次的导出结果
  const date = new Date().toISOString().slice(0, 10)
  exportCsv(`图书列表_${date}`, csvColumns, res.list)
  // 记一条操作日志（类型：导出）
  await recordLog({ type: '导出', description: `导出图书列表 ${res.list.length} 条` })
  ElMessage.success('导出成功')
}

// ============ 详情 ============
// 跳转详情页：用动态路由参数 /book/detail/:id 传递图书 id
function goDetail(row: BookItem) {
  router.push(`/book/detail/${row.id}`)
}

// 组件挂载完成后立刻加载第一页列表
onMounted(fetchList)
</script>

<template>
  <div class="book-list">
    <!-- 顶部筛选卡片 -->
    <el-card shadow="never" class="filter-card">
      <div class="filter-bar">
        <el-input
          v-model="filters.name"
          placeholder="图书名称"
          clearable
          style="width: 200px"
          @keyup.enter="handleSearch"
        />
        <el-select v-model="filters.category" placeholder="分类" clearable style="width: 160px">
          <el-option v-for="c in BOOK_CATEGORIES" :key="c" :label="c" :value="c" />
        </el-select>
        <el-select v-model="filters.status" placeholder="状态" clearable style="width: 140px">
          <el-option v-for="s in BOOK_STATUSES" :key="s" :label="s" :value="s" />
        </el-select>
        <el-button type="primary" @click="handleSearch">
          <el-icon><Search /></el-icon>查询
        </el-button>
        <el-button @click="handleReset">
          <el-icon><Refresh /></el-icon>重置
        </el-button>
      </div>
    </el-card>

    <!-- 表格卡片 -->
    <el-card shadow="never">
      <div class="table-toolbar">
        <!-- v-permission：自定义权限指令，传入所需权限码；当前用户没有该权限时按钮会被移除 -->
        <el-button v-permission="['book:add']" type="primary" @click="openAdd">
          <el-icon><Plus /></el-icon>新增图书
        </el-button>
        <el-button v-permission="['book:batchDelete']" type="danger" @click="handleBatchDelete">
          <el-icon><Delete /></el-icon>批量删除
        </el-button>
        <el-button v-permission="['book:export']" @click="handleExport">
          <el-icon><Download /></el-icon>导出 CSV
        </el-button>
      </div>

      <!-- 数据表格：v-loading 显示加载遮罩，row-key 给每行唯一标识（多选/展开需要） -->
      <!-- @selection-change 监听勾选变化，把选中行存进 selection -->
      <el-table
        v-loading="loading"
        :data="tableData"
        row-key="id"
        border
        @selection-change="handleSelectionChange"
      >
        <!-- type="selection" 渲染一列复选框，用于多选批量删除 -->
        <el-table-column type="selection" width="50" align="center" />
        <!-- 封面列：用 el-image 展示缩略图，preview-src-list 让点击后可放大预览 -->
        <el-table-column label="封面" width="80" align="center">
          <template #default="{ row }">
            <el-image
              v-if="row.cover"
              :src="row.cover"
              :preview-src-list="[row.cover]"
              fit="cover"
              preview-teleported
              style="width: 44px; height: 60px; border-radius: 3px"
            />
            <span v-else class="no-cover">无</span>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="书名" min-width="160" show-overflow-tooltip />
        <el-table-column prop="author" label="作者" min-width="110" show-overflow-tooltip />
        <el-table-column prop="isbn" label="ISBN" min-width="150" show-overflow-tooltip />
        <el-table-column prop="publisher" label="出版社" min-width="140" show-overflow-tooltip />
        <el-table-column prop="category" label="分类" width="90" align="center" />
        <!-- 状态用 el-tag 展示：在库绿色(success)、其它红色(danger)，一眼区分 -->
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === '在库' ? 'success' : 'danger'" size="small">
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="stock" label="库存" width="80" align="center" />
        <el-table-column prop="createTime" label="创建时间" width="170" />
        <!-- 操作列：fixed="right" 固定在右侧，横向滚动时操作按钮始终可见 -->
        <el-table-column label="操作" width="190" align="center" fixed="right">
          <template #default="{ row }">
            <!-- 详情不设权限，所有登录用户可看；编辑/删除按权限码控制显隐 -->
            <el-button link type="primary" @click="goDetail(row as BookItem)">详情</el-button>
            <el-button v-permission="['book:edit']" link type="primary" @click="openEdit(row as BookItem)">
              编辑
            </el-button>
            <el-button v-permission="['book:delete']" link type="danger" @click="handleDelete(row as BookItem)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页：current-page / page-size 双向绑定到 page / pageSize，改页码或每页条数都会重新拉数据 -->
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next, jumper"
        class="pagination"
        @current-change="fetchList"
        @size-change="handleSearch"
      />
    </el-card>

    <!-- 新增 / 编辑弹窗表单 -->
    <BookForm v-model="dialogVisible" :book="editingBook" @save="handleSave" />
  </div>
</template>

<style scoped>
.filter-card {
  margin-bottom: 16px;
}

.pagination {
  margin-top: 16px;
  justify-content: flex-end;
}

.no-cover {
  color: #c0c4cc;
  font-size: 12px;
}
</style>
