<script setup lang="ts">
import { nextTick, onMounted, reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import { addReader, deleteReader, editReader, getReaderList } from '@/api/reader'
import type { ReaderItem } from '@/types'

// ============ 页面说明 ============
// 本页是「读者管理」：上方筛选栏按姓名 / 借阅证号查询，中间表格展示读者列表，
// 下方分页组件翻页，右侧提供新增 / 编辑 / 删除操作。数据都来自 mock 后端（@/api/reader）。

// ============ 列表 / 分页 ============
// 列表页四要素：loading 控制加载动画，tableData 存当前页数据，total 存总条数，
// page/pageSize 存分页状态（ref 包裹，模板里使用时自动解包，无需写 .value）。
const loading = ref(false)
const tableData = ref<ReaderItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)

// ============ 筛选条件 ============
// 筛选字段用 reactive 包装成一个对象，方便整体重置和传参；字段较多且成组时比多个 ref 更直观。
const filters = reactive({
  name: '',
  cardNo: '',
})

// 拉取列表数据：把当前分页 + 筛选条件传给 mock 接口，成功后写回 tableData/total。
// 空字符串的筛选条件转成 undefined 传出去，避免把「空值」当作有意义的查询条件。
async function fetchList() {
  loading.value = true
  try {
    const res = await getReaderList({
      page: page.value,
      pageSize: pageSize.value,
      name: filters.name || undefined,
      cardNo: filters.cardNo || undefined,
    })
    tableData.value = res.list
    total.value = res.total
  } finally {
    // finally 保证无论请求成功还是抛错，loading 都会被复位，避免表格一直转圈
    loading.value = false
  }
}

// 查询时先把页码重置回第 1 页，否则若当前在第 3 页，直接查可能得到空列表
function handleSearch() {
  page.value = 1
  fetchList()
}

// 重置：清空筛选条件并回到第 1 页后重新查询
function handleReset() {
  filters.name = ''
  filters.cardNo = ''
  page.value = 1
  fetchList()
}

// ============ 新增 / 编辑 ============
const dialogVisible = ref(false)
const editingReader = ref<ReaderItem | null>(null)
const formRef = ref<FormInstance>()
const submitting = ref(false)
const form = reactive({ name: '', phone: '', cardNo: '' })

// 表单校验规则：name 为必填项，trigger: 'blur' 表示输入框「失焦」时触发校验
const rules: FormRules = {
  name: [{ required: true, message: '请输入读者姓名', trigger: 'blur' }],
}

// 打开「新增」弹窗：把 editingReader 置空表示是新增，同时清空表单各字段
function openAdd() {
  editingReader.value = null
  form.name = ''
  form.phone = ''
  form.cardNo = ''
  dialogVisible.value = true
  // 弹窗内容渲染需要等下一次 DOM 更新，用 nextTick 确保表单已挂载后再清除上一次残留的校验红字
  nextTick(() => formRef.value?.clearValidate())
}

// 打开「编辑」弹窗：把当前行整体存进 editingReader，再把行数据回填到表单
function openEdit(row: ReaderItem) {
  editingReader.value = row
  form.name = row.name
  form.phone = row.phone
  form.cardNo = row.cardNo
  dialogVisible.value = true
  // 同样等弹窗渲染完成后再清空校验状态，避免残留上一次的报错提示
  nextTick(() => formRef.value?.clearValidate())
}

// 保存：先手动调用 validate() 校验表单，校验失败会抛异常直接 return（不发请求）；
// submitting 是防抖标记，防止用户连点「确定」触发多次提交
async function handleSave() {
  if (!formRef.value || submitting.value) return
  try {
    await formRef.value.validate()
  } catch {
    // 校验不通过直接返回
    return
  }
  submitting.value = true
  try {
    if (editingReader.value) {
      await editReader({ id: editingReader.value.id, name: form.name, phone: form.phone, cardNo: form.cardNo })
      ElMessage.success('编辑成功')
    } else {
      await addReader({ name: form.name, phone: form.phone, cardNo: form.cardNo })
      ElMessage.success('新增成功')
    }
    dialogVisible.value = false
    fetchList()
  } finally {
    submitting.value = false
  }
}

// ============ 删除 ============
// 删除前用 ElMessageBox.confirm 弹二次确认框，避免误删；确认后再调删除接口
async function handleDelete(row: ReaderItem) {
  try {
    await ElMessageBox.confirm(`确定要删除读者「${row.name}」吗？`, '删除确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    // 点击「取消」或关闭弹窗会走这里，直接结束，不执行删除
    return
  }
  // 若该读者存在未归还借阅，mock 层会返回错误提示
  await deleteReader(row.id)
  ElMessage.success('删除成功')
  // 删除后当前页可能变成空页（比如最后一页唯一一条被删），
  // 这里重新计算最大页码，若当前页超出就回退到最后一页，避免出现空列表
  const maxPage = Math.max(1, Math.ceil((total.value - 1) / pageSize.value))
  if (page.value > maxPage) page.value = maxPage
  fetchList()
}

// 组件挂载完成后立即拉取第一页数据
onMounted(fetchList)
</script>

<template>
  <div class="reader-list">
    <!-- 筛选栏 -->
    <el-card shadow="never" class="filter-card">
      <div class="filter-bar">
        <el-input
          v-model="filters.name"
          placeholder="读者姓名"
          clearable
          style="width: 180px"
          @keyup.enter="handleSearch"
        />
        <el-input
          v-model="filters.cardNo"
          placeholder="借阅证号"
          clearable
          style="width: 180px"
          @keyup.enter="handleSearch"
        />
        <el-button type="primary" @click="handleSearch">
          <el-icon><Search /></el-icon>查询
        </el-button>
        <el-button @click="handleReset">
          <el-icon><Refresh /></el-icon>重置
        </el-button>
        <!-- v-permission 是自定义指令：当前用户若没有 reader:add 权限，这个按钮会被自动隐藏 -->
        <el-button v-permission="['reader:add']" type="success" @click="openAdd">
          <el-icon><Plus /></el-icon>新增读者
        </el-button>
      </div>
    </el-card>

    <!-- 表格 -->
    <el-card shadow="never">
      <el-table v-loading="loading" :data="tableData" border>
        <el-table-column prop="id" label="ID" width="70" align="center" />
        <el-table-column prop="name" label="姓名" min-width="120" />
        <el-table-column prop="phone" label="电话" min-width="140" />
        <el-table-column prop="cardNo" label="借阅证号" min-width="140" />
        <el-table-column prop="createTime" label="创建时间" width="170" />
        <el-table-column label="操作" width="150" align="center" fixed="right">
          <template #default="{ row }">
            <el-button v-permission="['reader:edit']" link type="primary" @click="openEdit(row as ReaderItem)">
              编辑
            </el-button>
            <el-button v-permission="['reader:delete']" link type="danger" @click="handleDelete(row as ReaderItem)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- layout 决定分页条展示哪些控件：总数、每页条数、上一页/页码/下一页、跳页输入框。
           current-change 在「翻页」时触发，size-change 在「切换每页条数」时触发，两者处理不同（后者要回第 1 页） -->
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

    <!-- 新增 / 编辑弹窗：新增和编辑复用同一个弹窗，靠 editingReader 是否为 null 区分 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingReader ? '编辑读者' : '新增读者'"
      width="440px"
      :close-on-click-modal="false"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="姓名" prop="name">
          <el-input v-model="form.name" placeholder="请输入读者姓名" />
        </el-form-item>
        <el-form-item label="电话">
          <el-input v-model="form.phone" placeholder="请输入联系电话" />
        </el-form-item>
        <el-form-item label="借阅证号">
          <el-input v-model="form.cardNo" placeholder="请输入借阅证号" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSave">确定</el-button>
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
</style>
