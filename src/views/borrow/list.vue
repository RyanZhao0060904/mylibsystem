<script setup lang="ts">
// onMounted 挂载后加载列表；reactive / ref 响应式状态
import { onMounted, reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
// ElMessage 轻提示 / ElMessageBox 二次确认弹框
import { ElMessage, ElMessageBox } from 'element-plus'
// 借阅相关接口：新增、删除、列表、续借、归还
import { addBorrow, deleteBorrow, getBorrowList, renewBorrow, returnBorrow } from '@/api/borrow'
// 新增借阅时要用图书/读者下拉数据，这里借用这两类列表接口
import { getBookList } from '@/api/book'
import { getReaderList } from '@/api/reader'
import { BORROW_STATUSES } from '@/constants'
import type { BookItem, BorrowRecord, ReaderItem } from '@/types'

const loading = ref(false)
const tableData = ref<BorrowRecord[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)

// 筛选：时间范围 + 借阅状态
// timeRange 用数组存 [开始日期, 结束日期]，对应 el-date-picker 的 daterange 类型
const filters = reactive({
  timeRange: [] as string[],
  status: '',
})

async function fetchList() {
  loading.value = true
  try {
    // 日期选择器只给到「天」，这里手动补时分秒：
    // 开始日拼 00:00:00、结束日拼 23:59:59，保证一整天的数据都能被查到
    const [start, end] = filters.timeRange
    const res = await getBorrowList({
      page: page.value,
      pageSize: pageSize.value,
      status: filters.status || undefined,
      startTime: start ? `${start} 00:00:00` : undefined,
      endTime: end ? `${end} 23:59:59` : undefined,
    })
    tableData.value = res.list
    total.value = res.total
  } finally {
    loading.value = false
  }
}

// 查询：条件变化后回到第一页再查
function handleSearch() {
  page.value = 1
  fetchList()
}

// 重置：清空时间范围和状态，回到第一页
function handleReset() {
  filters.timeRange = []
  filters.status = ''
  page.value = 1
  fetchList()
}

// 借阅状态 → tag 颜色
// 已归还绿色(success)、已逾期红色(danger)、借阅中黄色(warning)，用颜色快速区分状态
function statusTagType(status: BorrowRecord['status']) {
  if (status === '已归还') return 'success'
  if (status === '已逾期') return 'danger'
  return 'warning'
}

// 确认归还：二次确认后才调用归还接口，避免误操作把书标记成已归还
async function handleReturn(row: BorrowRecord) {
  try {
    // 点「确定」resolve，点「取消」或关闭弹框 reject
    await ElMessageBox.confirm(`确认《${row.bookName}》已归还吗？`, '确认归还', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    // 用户取消，直接返回
    return
  }
  await returnBorrow(row.id)
  ElMessage.success('归还成功')
  fetchList()
}

// ============ 续借 ============
// 续借弹窗相关状态：id 记录要续哪条、bookName 仅用于展示、days 默认 30 天
const renewVisible = ref(false)
const renewSubmitting = ref(false)
const renewForm = reactive({ id: 0, bookName: '', days: 30 })

function openRenew(row: BorrowRecord) {
  // 把当前行信息填进弹窗，days 重置回默认 30 天
  renewForm.id = row.id
  renewForm.bookName = row.bookName
  renewForm.days = 30
  renewVisible.value = true
}

async function handleRenew() {
  if (renewSubmitting.value) return
  renewSubmitting.value = true
  try {
    // 续借天数范围 1~30 天，由模板里的 el-input-number :min/:max 限制
    await renewBorrow(renewForm.id, renewForm.days)
    ElMessage.success('续借成功')
    renewVisible.value = false
    fetchList()
  } finally {
    renewSubmitting.value = false
  }
}

// 删除异常流水记录
async function handleDelete(row: BorrowRecord) {
  try {
    await ElMessageBox.confirm(`确定要删除借阅记录《${row.bookName}》吗？`, '删除确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    // 用户取消二次确认，直接返回
    return
  }
  await deleteBorrow(row.id)
  ElMessage.success('删除成功')
  // 页码越界处理：删除后总数减 1，若当前页已超过最大页就拉回最大页，
  // 否则停留在越界页码会请求到空数据（表现为一张空白表格）
  const maxPage = Math.max(1, Math.ceil((total.value - 1) / pageSize.value))
  if (page.value > maxPage) page.value = maxPage
  fetchList()
}

// ============ 新增借阅 ============
const borrowVisible = ref(false)
const borrowFormRef = ref<FormInstance>()
const borrowSubmitting = ref(false)
// 借阅表单：bookId / readerId 初始为 null，用下拉选择图书和读者
const borrowForm = reactive({ bookId: null as number | null, readerId: null as number | null, days: 30 })
// 新增借阅校验：图书和读者必选，trigger: 'change' 表示下拉值改变时校验
const borrowRules: FormRules = {
  bookId: [{ required: true, message: '请选择图书', trigger: 'change' }],
  readerId: [{ required: true, message: '请选择读者', trigger: 'change' }],
}
// 下拉选项：可选图书（在库）和全部读者
const bookOptions = ref<BookItem[]>([])
const readerOptions = ref<ReaderItem[]>([])

async function openBorrow() {
  // 打开弹窗前先重置表单为默认值
  borrowForm.bookId = null
  borrowForm.readerId = null
  borrowForm.days = 30
  borrowVisible.value = true
  // 加载在库图书（有库存才可借）+ 全部读者
  // Promise.all 并行请求两个接口，都返回后再一起赋值，减少等待时间
  const [bookRes, readerRes] = await Promise.all([
    getBookList({ page: 1, pageSize: 99999, status: '在库' }),
    getReaderList({ page: 1, pageSize: 99999 }),
  ])
  bookOptions.value = bookRes.list
  readerOptions.value = readerRes.list
}

// 提交新增借阅：校验通过后调用接口，成功后关闭弹窗并刷新列表
async function handleBorrowSubmit() {
  if (!borrowFormRef.value || borrowSubmitting.value) return
  try {
    await borrowFormRef.value.validate()
  } catch {
    // 校验不通过（图书/读者未选）直接返回
    return
  }
  borrowSubmitting.value = true
  try {
    // bookId / readerId 已通过必填校验，这里用「非空断言 !」告诉 TS 它们不是 null
    await addBorrow({
      bookId: borrowForm.bookId!,
      readerId: borrowForm.readerId!,
      days: borrowForm.days,
    })
    ElMessage.success('借阅成功')
    borrowVisible.value = false
    fetchList()
  } finally {
    borrowSubmitting.value = false
  }
}

onMounted(fetchList)
</script>

<template>
  <div class="borrow-list">
    <!-- 筛选栏 -->
    <el-card shadow="never" class="filter-card">
      <div class="filter-bar">
        <!-- 时间范围选择：type="daterange" 一次选起止两天，v-model 绑定到 filters.timeRange 数组 -->
        <el-date-picker
          v-model="filters.timeRange"
          type="daterange"
          range-separator="至"
          start-placeholder="借阅开始日期"
          end-placeholder="借阅结束日期"
          value-format="YYYY-MM-DD"
          style="width: 260px"
        />
        <el-select v-model="filters.status" placeholder="借阅状态" clearable style="width: 140px">
          <el-option v-for="s in BORROW_STATUSES" :key="s" :label="s" :value="s" />
        </el-select>
        <el-button type="primary" @click="handleSearch">
          <el-icon><Search /></el-icon>查询
        </el-button>
        <el-button @click="handleReset">
          <el-icon><Refresh /></el-icon>重置
        </el-button>
        <!-- 新增借阅按钮带权限：只有具备 borrow:add 权限的用户才能看到 -->
        <el-button v-permission="['borrow:add']" type="success" @click="openBorrow">
          <el-icon><Plus /></el-icon>新增借阅
        </el-button>
      </div>
    </el-card>

    <!-- 流水表格 -->
    <el-card shadow="never">
      <el-table v-loading="loading" :data="tableData" border>
        <el-table-column prop="id" label="流水号" width="90" align="center" />
        <el-table-column prop="bookName" label="图书名称" min-width="160" show-overflow-tooltip />
        <el-table-column prop="borrower" label="借阅人" width="100" align="center" />
        <el-table-column prop="borrowTime" label="借阅时间" width="170" />
        <el-table-column prop="dueDate" label="应还日期" width="170" />
        <!-- 归还时间可能为空（未归还），空时显示占位符「—」 -->
        <el-table-column prop="returnTime" label="归还时间" width="170">
          <template #default="{ row }">{{ row.returnTime || '—' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <!-- 续借列：renewCount >= 1 说明已经续借过（最多续一次），展示「已续借」 -->
        <el-table-column label="续借" width="90" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.renewCount >= 1" type="success" size="small">已续借</el-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="230" align="center" fixed="right">
          <template #default="{ row }">
            <!-- 确认归还：已归还的记录禁用，避免重复归还 -->
            <el-button
              v-permission="['borrow:return']"
              link
              type="primary"
              :disabled="row.status === '已归还'"
              @click="handleReturn(row as BorrowRecord)"
            >
              确认归还
            </el-button>
            <!-- 续借的「状态机」：只有「借阅中」且「还没续借过(renewCount < 1)」才显示续借按钮 -->
            <!-- 业务规则是每条记录最多只能续借一次，续过一次后按钮自动隐藏 -->
            <el-button
              v-permission="['borrow:renew']"
              v-if="row.status === '借阅中' && row.renewCount < 1"
              link
              type="warning"
              @click="openRenew(row as BorrowRecord)"
            >
              续借
            </el-button>
            <el-button
              v-permission="['borrow:delete']"
              link
              type="danger"
              @click="handleDelete(row as BorrowRecord)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页组件：改页码重新拉数据，改每页条数则从第一页重新查 -->
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

    <!-- 新增借阅弹窗 -->
    <el-dialog v-model="borrowVisible" title="新增借阅" width="480px" :close-on-click-modal="false">
      <el-form ref="borrowFormRef" :model="borrowForm" :rules="borrowRules" label-width="80px">
        <!-- 图书下拉：选项里拼上库存，方便管理员判断该选哪本 -->
        <el-form-item label="图书" prop="bookId">
          <el-select v-model="borrowForm.bookId" placeholder="请选择图书" style="width: 100%">
            <el-option
              v-for="b in bookOptions"
              :key="b.id"
              :label="`${b.name}（库存 ${b.stock}）`"
              :value="b.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="读者" prop="readerId">
          <el-select v-model="borrowForm.readerId" placeholder="请选择读者" style="width: 100%">
            <el-option
              v-for="r in readerOptions"
              :key="r.id"
              :label="`${r.name}（${r.cardNo}）`"
              :value="r.id"
            />
          </el-select>
        </el-form-item>
        <!-- 借阅天数：1~60 天，这里和续借(1~30)上限不同，注意区分 -->
        <el-form-item label="借阅天数">
          <el-input-number v-model="borrowForm.days" :min="1" :max="60" style="width: 100%" />
          <div class="renew-tip">最长借阅 2 个月（60 天）</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="borrowVisible = false">取消</el-button>
        <el-button type="primary" :loading="borrowSubmitting" @click="handleBorrowSubmit">
          确定
        </el-button>
      </template>
    </el-dialog>

    <!-- 续借弹窗 -->
    <el-dialog v-model="renewVisible" title="续借" width="420px" :close-on-click-modal="false">
      <el-form label-width="80px">
        <!-- 图书名只读展示，续借对象由 openRenew 时已确定 -->
        <el-form-item label="图书">
          <span>{{ renewForm.bookName }}</span>
        </el-form-item>
        <!-- 续借天数：1~30 天，对应「最多续一次、最长续 30 天」的业务规则 -->
        <el-form-item label="续借天数">
          <el-input-number v-model="renewForm.days" :min="1" :max="30" style="width: 100%" />
          <div class="renew-tip">最长可续借 30 天</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="renewVisible = false">取消</el-button>
        <el-button type="primary" :loading="renewSubmitting" @click="handleRenew">确定</el-button>
      </template>
    </el-dialog>
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

.renew-tip {
  margin-top: 6px;
  color: #909399;
  font-size: 12px;
}
</style>
