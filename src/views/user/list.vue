<script setup lang="ts">
import { nextTick, onMounted, reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import { addUser, deleteUser, editUser, getUserList, resetUserPassword } from '@/api/user'
import type { UserItem } from '@/types'

// ============ 页面说明 ============
// 本页是「用户管理」：维护能登录后台的账号，包含新增/编辑/重置密码/删除，以及角色下拉选择。
// 角色目前只有 admin（超级管理员）和 lib（图书馆管理员）两种，用常量数组 + 映射表统一管理。

// ============ 角色选项 ============
// roleOptions 供下拉框渲染，value 是真正提交给后端的值，label 是界面显示的文字
const roleOptions = [
  { value: 'admin', label: '超级管理员' },
  { value: 'lib', label: '图书馆管理员' },
]

// 角色值 -> 中文名的映射，表格里直接拿 role 查表得到显示文字；查不到就显示原值（模板里用 ?? 兜底）
const roleNameMap: Record<string, string> = {
  admin: '超级管理员',
  lib: '图书馆管理员',
}

// 根据角色返回 el-tag 的颜色类型：admin 用红色（danger）突出最高权限，lib 用黄色（warning）
function roleTagType(role: string) {
  if (role === 'admin') return 'danger'
  if (role === 'lib') return 'warning'
  return 'info'
}

// ============ 列表 / 分页 ============
const loading = ref(false)
const tableData = ref<UserItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
// 用户名筛选关键词（单独用 ref 即可，因为只有一个筛选字段）
const username = ref('')

// 拉取用户列表；空用户名转 undefined，避免传空字符串干扰查询
async function fetchList() {
  loading.value = true
  try {
    const res = await getUserList({
      page: page.value,
      pageSize: pageSize.value,
      username: username.value || undefined,
    })
    tableData.value = res.list
    total.value = res.total
  } finally {
    // 无论成败都复位 loading，防止表格一直转圈
    loading.value = false
  }
}

// 查询前先把页码重置回 1，否则在高页码上查询可能得到空结果
function handleSearch() {
  page.value = 1
  fetchList()
}

// 重置：清空关键词 + 回到第 1 页，再重新请求
function handleReset() {
  username.value = ''
  page.value = 1
  fetchList()
}

// ============ 新增 / 编辑 ============
const dialogVisible = ref(false)
const isEdit = ref(false)
const editingId = ref<number | null>(null)
const formRef = ref<FormInstance>()
const submitting = ref(false)
// 新增/编辑共用的表单；role 默认 lib（图书馆管理员），避免空角色
const form = reactive({ username: '', password: '', nickname: '', role: 'lib' })

// 校验规则：用户名、密码必填；角色是下拉选择，用 trigger: 'change' 在「选择变化」时校验
const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入初始密码', trigger: 'blur' }],
  role: [{ required: true, message: '请选择角色', trigger: 'change' }],
}

// 打开新增弹窗：isEdit 置 false、editingId 置 null，并重置表单（角色默认 lib）
function openAdd() {
  isEdit.value = false
  editingId.value = null
  form.username = ''
  form.password = ''
  form.nickname = ''
  form.role = 'lib'
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

// 打开编辑弹窗：记录要编辑的用户 id，回填除密码外的字段（编辑时不修改密码，密码留空）
function openEdit(row: UserItem) {
  isEdit.value = true
  editingId.value = row.id
  form.username = row.username
  form.password = ''
  form.nickname = row.nickname
  form.role = row.role
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

// 保存：先校验，再根据 isEdit 决定走编辑还是新增接口；submitting 防止重复提交
async function handleSave() {
  if (!formRef.value || submitting.value) return
  try {
    await formRef.value.validate()
  } catch {
    // 校验不通过直接返回，不发起请求
    return
  }
  submitting.value = true
  try {
    if (isEdit.value) {
      // 编辑时不改用户名和密码，只提交昵称和角色
      await editUser({ id: editingId.value!, nickname: form.nickname, role: form.role })
      ElMessage.success('编辑成功')
    } else {
      await addUser({ username: form.username, password: form.password, nickname: form.nickname || form.username, role: form.role })
      ElMessage.success('新增成功')
    }
    dialogVisible.value = false
    fetchList()
  } finally {
    submitting.value = false
  }
}

// ============ 重置密码 ============
// 用 ElMessageBox.prompt 弹一个带输入框的对话框，让管理员输入新密码；
// inputType: 'password' 让输入框显示为密码形式，inputValue 预设默认密码 123456
async function handleResetPassword(row: UserItem) {
  try {
    const { value } = await ElMessageBox.prompt(`请输入用户「${row.username}」的新密码`, '重置密码', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputType: 'password',
      inputValue: '123456',
    })
    await resetUserPassword(row.id, value)
    ElMessage.success('密码重置成功')
  } catch {
    // 用户取消
  }
}

// ============ 删除 ============
// 删除前二次确认；确认后调删除接口
async function handleDelete(row: UserItem) {
  try {
    await ElMessageBox.confirm(`确定要删除用户「${row.username}」吗？`, '删除确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    // 取消删除直接结束
    return
  }
  // 不能删除自己 / 内置 admin，由 mock 层校验
  await deleteUser(row.id)
  ElMessage.success('删除成功')
  // 若当前页删空则回退到上一页
  const maxPage = Math.max(1, Math.ceil((total.value - 1) / pageSize.value))
  if (page.value > maxPage) page.value = maxPage
  fetchList()
}

// 组件挂载后拉取第一页
onMounted(fetchList)
</script>

<template>
  <div class="user-list">
    <!-- 筛选栏 -->
    <el-card shadow="never" class="filter-card">
      <div class="filter-bar">
        <el-input
          v-model="username"
          placeholder="用户名"
          clearable
          style="width: 200px"
          @keyup.enter="handleSearch"
        />
        <el-button type="primary" @click="handleSearch">
          <el-icon><Search /></el-icon>查询
        </el-button>
        <el-button @click="handleReset">
          <el-icon><Refresh /></el-icon>重置
        </el-button>
        <!-- 只有具备 user:add 权限的用户才能看到「新增用户」按钮 -->
        <el-button v-permission="['user:add']" type="success" @click="openAdd">
          <el-icon><Plus /></el-icon>新增用户
        </el-button>
      </div>
    </el-card>

    <!-- 表格 -->
    <el-card shadow="never">
      <el-table v-loading="loading" :data="tableData" border>
        <el-table-column prop="id" label="ID" width="70" align="center" />
        <el-table-column prop="username" label="用户名" min-width="140" />
        <el-table-column prop="nickname" label="昵称" min-width="140" />
        <el-table-column label="角色" width="140" align="center">
          <template #default="{ row }">
            <!-- roleNameMap 查不到时用 ?? 兜底显示原始角色值；type 由 roleTagType 决定颜色 -->
            <el-tag :type="roleTagType(row.role)" size="small">{{ roleNameMap[row.role] ?? row.role }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createTime" label="创建时间" width="170" />
        <el-table-column label="操作" width="210" align="center" fixed="right">
          <template #default="{ row }">
            <!-- v-permission 自定义指令：无对应权限时按钮自动隐藏；row as UserItem 是模板内 TS 类型断言 -->
            <el-button v-permission="['user:edit']" link type="primary" @click="openEdit(row as UserItem)">
              编辑
            </el-button>
            <el-button v-permission="['user:reset']" link type="warning" @click="handleResetPassword(row as UserItem)">
              重置密码
            </el-button>
            <el-button v-permission="['user:delete']" link type="danger" @click="handleDelete(row as UserItem)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- current-change（翻页）与 size-change（改每页条数）分开处理：改每页条数时回到第 1 页 -->
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

    <!-- 新增 / 编辑弹窗：靠 isEdit 区分两种模式，共用一个弹窗和表单 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑用户' : '新增用户'"
      width="440px"
      :close-on-click-modal="false"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <!-- 编辑时用户名作为账号标识不可修改，因此禁用输入框 -->
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" :disabled="isEdit" placeholder="请输入用户名" />
        </el-form-item>
        <!-- 密码只在新增时填写；编辑不提供修改密码入口（另有「重置密码」功能） -->
        <el-form-item v-if="!isEdit" label="密码" prop="password">
          <el-input v-model="form.password" type="password" show-password placeholder="请输入初始密码" />
        </el-form-item>
        <el-form-item label="昵称">
          <el-input v-model="form.nickname" placeholder="请输入昵称" />
        </el-form-item>
        <el-form-item label="角色" prop="role">
          <!-- v-for 遍历 roleOptions 生成下拉选项，value 提交的是 role 标识，label 是显示的中文名 -->
          <el-select v-model="form.role" placeholder="请选择角色" style="width: 100%">
            <el-option v-for="r in roleOptions" :key="r.value" :label="r.label" :value="r.value" />
          </el-select>
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
