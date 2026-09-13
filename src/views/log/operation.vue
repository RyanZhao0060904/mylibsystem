<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getLogList, recordLog } from '@/api/log'
import { exportCsv, type CsvColumn } from '@/utils/csv'
import type { OperationLog } from '@/types'

// ============ 页面说明 ============
// 本页是「操作日志」：只读列表，用来审计谁在什么时候做了什么操作、结果如何。
// 与其它 CRUD 页不同，这里没有任何新增/编辑/删除按钮，只有查询、筛选和导出 CSV。

const loading = ref(false)
const tableData = ref<OperationLog[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)

// 筛选：操作人 + 操作时间范围
// timeRange 存的是日期范围数组，形如 ['2026-01-01','2026-01-31']，由 el-date-picker 的 daterange 模式写入
const filters = reactive({
  operator: '',
  timeRange: [] as string[],
})

async function fetchList() {
  loading.value = true
  try {
    // 解构出起止日期；日期选择器只返回「日」，这里补全成当天的 00:00:00 到 23:59:59，形成完整时间段
    const [start, end] = filters.timeRange
    const res = await getLogList({
      page: page.value,
      pageSize: pageSize.value,
      operator: filters.operator || undefined,
      startTime: start ? `${start} 00:00:00` : undefined,
      endTime: end ? `${end} 23:59:59` : undefined,
    })
    tableData.value = res.list
    total.value = res.total
  } finally {
    // 复位 loading
    loading.value = false
  }
}

// 查询前回到第 1 页
function handleSearch() {
  page.value = 1
  fetchList()
}

// 重置：清空操作人和时间范围后回到第 1 页
function handleReset() {
  filters.operator = ''
  filters.timeRange = []
  page.value = 1
  fetchList()
}

// 操作类型 / 结果标签（type 为 el-tag 的合法取值联合类型）
// 这里把「操作类型」映射成 el-tag 的颜色：登录/登出用 info（灰）、新增/授权用 success（绿）、
// 编辑用 warning（黄）、删除/越权用 danger（红）、导出用 primary（蓝）
type TagType = 'primary' | 'success' | 'warning' | 'info' | 'danger'
const typeTagMap: Record<string, TagType> = {
  登录: 'info',
  登出: 'info',
  新增: 'success',
  编辑: 'warning',
  删除: 'danger',
  导出: 'primary',
  授权: 'success',
  越权: 'danger',
}

// 导出 CSV（仅查询导出，禁止增删改）
// csvColumns 描述导出文件里每一列的表头（title）和取哪个字段（key），exportCsv 按它生成文件
const csvColumns: CsvColumn<OperationLog>[] = [
  { title: '操作人', key: 'operator' },
  { title: '操作时间', key: 'time' },
  { title: '操作描述', key: 'description' },
  { title: '操作类型', key: 'type' },
  { title: '操作结果', key: 'result' },
]

async function handleExport() {
  const [start, end] = filters.timeRange
  // 导出时无视分页，直接 pageSize: 99999 一次性拉取符合当前筛选条件的全部日志
  const res = await getLogList({
    page: 1,
    pageSize: 99999,
    operator: filters.operator || undefined,
    startTime: start ? `${start} 00:00:00` : undefined,
    endTime: end ? `${end} 23:59:59` : undefined,
  })
  if (res.list.length === 0) {
    ElMessage.warning('没有可导出的日志')
    return
  }
  // 文件名带上当天日期，方便区分不同批次的导出
  const date = new Date().toISOString().slice(0, 10)
  exportCsv(`操作日志_${date}`, csvColumns, res.list)
  // 导出这个动作本身也要记一条日志，保证审计链完整
  await recordLog({ type: '导出', description: `导出操作日志 ${res.list.length} 条` })
  ElMessage.success('导出成功')
}

// 挂载后拉取第一页
onMounted(fetchList)
</script>

<template>
  <div class="log-page">
    <!-- 筛选栏 -->
    <el-card shadow="never" class="filter-card">
      <div class="filter-bar">
        <el-input
          v-model="filters.operator"
          placeholder="操作人"
          clearable
          style="width: 180px"
          @keyup.enter="handleSearch"
        />
        <!-- value-format="YYYY-MM-DD" 让选择器直接输出 'YYYY-MM-DD' 字符串数组，方便后面拼时间 -->
        <el-date-picker
          v-model="filters.timeRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          style="width: 260px"
        />
        <el-button type="primary" @click="handleSearch">
          <el-icon><Search /></el-icon>查询
        </el-button>
        <el-button @click="handleReset">
          <el-icon><Refresh /></el-icon>重置
        </el-button>
        <!-- 导出当前筛选条件下的全部日志为 CSV 文件 -->
        <el-button @click="handleExport">
          <el-icon><Download /></el-icon>导出 CSV
        </el-button>
      </div>
    </el-card>

    <!-- 日志表格（只有查询、筛选、导出，禁止新增/编辑/删除） -->
    <el-card shadow="never">
      <el-table v-loading="loading" :data="tableData" border>
        <el-table-column prop="id" label="ID" width="70" align="center" />
        <el-table-column prop="operator" label="操作人" width="120" align="center" />
        <el-table-column prop="time" label="操作时间" width="180" />
        <el-table-column prop="description" label="操作描述" min-width="220" show-overflow-tooltip />
        <el-table-column label="操作类型" width="100" align="center">
          <template #default="{ row }">
            <!-- 用 typeTagMap 查颜色，查不到的类型兜底显示灰色 info -->
            <el-tag :type="typeTagMap[row.type] ?? 'info'" size="small">{{ row.type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作结果" width="100" align="center">
          <template #default="{ row }">
            <!-- 成功绿色、失败红色，直接按结果字符串三元判断 -->
            <el-tag :type="row.result === '成功' ? 'success' : 'danger'" size="small">
              {{ row.result }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>

      <!-- 翻页触发 fetchList，改每页条数触发 handleSearch（回到第 1 页） -->
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
</style>
