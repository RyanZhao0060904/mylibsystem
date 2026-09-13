<script setup lang="ts">
import { nextTick, onMounted, reactive, ref } from 'vue'
import type { ElTree, FormInstance, FormRules } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import { deleteRole, getRoleList, saveRole } from '@/api/role'
import type { RoleItem } from '@/types'

// ============ 页面说明 ============
// 本页是「角色管理」：管理角色的基本信息，并给角色分配权限（RBAC 权限模型）。
// 核心是 el-tree 权限树：树节点分「父节点」（如图书管理）和「叶子节点」（如 book:add），
// 实际存到角色上的权限就是这些叶子节点的 id 列表（如 ['book:view','book:add']）。

// ============ 权限树（RBAC 权限分配） ============
// 树的节点结构：id 是唯一标识（也是权限点），label 是显示文字，children 是子节点
interface TreeNode {
  id: string
  label: string
  children?: TreeNode[]
}

// 静态的权限树数据：父节点只是「分组」，本身不是可授权点；叶子节点才是真正的权限标识。
// 这些 id（如 book:view）与各页面按钮上的 v-permission="['book:view']" 一一对应。
const permissionTree: TreeNode[] = [
  {
    id: 'book',
    label: '图书管理',
    children: [
      { id: 'book:view', label: '查看图书' },
      { id: 'book:add', label: '新增图书' },
      { id: 'book:edit', label: '编辑图书' },
      { id: 'book:delete', label: '删除图书' },
      { id: 'book:batchDelete', label: '批量删除' },
      { id: 'book:export', label: '导出图书' },
    ],
  },
  {
    id: 'borrow',
    label: '借阅管理',
    children: [
      { id: 'borrow:view', label: '查看借阅' },
      { id: 'borrow:add', label: '新增借阅' },
      { id: 'borrow:return', label: '确认归还' },
      { id: 'borrow:renew', label: '续借' },
      { id: 'borrow:delete', label: '删除借阅记录' },
    ],
  },
  {
    id: 'reader',
    label: '读者管理',
    children: [
      { id: 'reader:view', label: '查看读者' },
      { id: 'reader:add', label: '新增读者' },
      { id: 'reader:edit', label: '编辑读者' },
      { id: 'reader:delete', label: '删除读者' },
    ],
  },
  {
    id: 'user',
    label: '用户管理',
    children: [
      { id: 'user:view', label: '查看用户' },
      { id: 'user:add', label: '新增用户' },
      { id: 'user:edit', label: '编辑用户' },
      { id: 'user:reset', label: '重置密码' },
      { id: 'user:delete', label: '删除用户' },
    ],
  },
]

// ============ 列表 ============
const loading = ref(false)
const tableData = ref<RoleItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
// 角色名称筛选关键词
const name = ref('')

// 拉取角色列表；空名称转 undefined
async function fetchList() {
  loading.value = true
  try {
    const res = await getRoleList({ page: page.value, pageSize: pageSize.value, name: name.value || undefined })
    tableData.value = res.list
    total.value = res.total
  } finally {
    // 无论成败都复位 loading
    loading.value = false
  }
}

// 查询时回到第 1 页
function handleSearch() {
  page.value = 1
  fetchList()
}

// ============ 新增角色 ============
const addVisible = ref(false)
const addFormRef = ref<FormInstance>()
const addForm = reactive({ name: '', description: '' })
// 新增角色只要求角色名必填
const addRules: FormRules = {
  name: [{ required: true, message: '请输入角色名', trigger: 'blur' }],
}

// 打开新增弹窗：清空表单并等渲染后清掉残留校验
function openAdd() {
  addForm.name = ''
  addForm.description = ''
  addVisible.value = true
  nextTick(() => addFormRef.value?.clearValidate())
}

// 保存新增：校验通过后调用 saveRole，权限先给空数组，之后再通过「编辑权限」单独分配
async function handleAdd() {
  if (!addFormRef.value) return
  try {
    await addFormRef.value.validate()
  } catch {
    return
  }
  await saveRole({ name: addForm.name, description: addForm.description, permissions: [] })
  ElMessage.success('新增角色成功')
  addVisible.value = false
  fetchList()
}

// ============ 编辑权限（el-tree 父子联动） ============
const editVisible = ref(false)
// currentRole 记录正在编辑的角色，保存时用它拿到 id 和原有信息
const currentRole = ref<RoleItem | null>(null)
// treeRef 是 el-tree 组件的引用，通过它调用 setCheckedKeys / getCheckedKeys 两个核心方法
const treeRef = ref<InstanceType<typeof ElTree>>()

// 打开「编辑权限」弹窗：记录当前角色，把该角色已有的权限回显到树的勾选状态上
async function openEdit(row: RoleItem) {
  currentRole.value = row
  editVisible.value = true
  // 弹窗打开后再回显，避免树未渲染导致 setCheckedKeys 失效
  await nextTick()
  // setCheckedKeys 传入权限 id 数组，树会自动把这些节点（及其父节点）勾选上
  treeRef.value?.setCheckedKeys(row.permissions)
}

// 保存权限：把树上当前勾选的权限重新提交给后端
async function handleSavePermission() {
  if (!currentRole.value) return
  // 只取叶子节点（具体权限标识）
  // getCheckedKeys(true)：参数 true 表示只返回「完全勾选」的叶子节点，排除父分组节点；
  // 若不传 true 会包含半选/父节点，导致把分组 id（如 book）也当成权限存进去
  const checkedKeys = (treeRef.value?.getCheckedKeys(true) ?? []) as string[]
  await saveRole({
    id: currentRole.value.id,
    name: currentRole.value.name,
    description: currentRole.value.description,
    permissions: checkedKeys,
  })
  ElMessage.success('权限保存成功')
  editVisible.value = false
  fetchList()
}

// ============ 删除角色 ============
// 删除前二次确认
async function handleDelete(row: RoleItem) {
  try {
    await ElMessageBox.confirm(`确定要删除角色「${row.name}」吗？`, '删除确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    // 取消删除
    return
  }
  // 若角色正在被用户使用，mock 层会返回错误提示
  await deleteRole(row.id)
  ElMessage.success('删除成功')
  // 删空当前页则回退到最后一页
  const maxPage = Math.max(1, Math.ceil((total.value - 1) / pageSize.value))
  if (page.value > maxPage) page.value = maxPage
  fetchList()
}

// 把权限数组转成表格里的一句话：* 代表超级管理员的全量权限，其余按数量显示
function permissionText(row: RoleItem): string {
  if (row.permissions.includes('*')) return '全部权限'
  return row.permissions.length ? `${row.permissions.length} 项权限` : '无权限'
}

// 挂载后拉取第一页
onMounted(fetchList)
</script>

<template>
  <div class="role-list">
    <el-card shadow="never" class="filter-card">
      <div class="filter-bar">
        <el-input
          v-model="name"
          placeholder="角色名称"
          clearable
          style="width: 200px"
          @keyup.enter="handleSearch"
        />
        <el-button type="primary" @click="handleSearch">
          <el-icon><Search /></el-icon>查询
        </el-button>
        <!-- 只有具备 role:add 权限才能看到新增角色按钮 -->
        <el-button v-permission="['role:add']" type="success" @click="openAdd">
          <el-icon><Plus /></el-icon>新增角色
        </el-button>
      </div>
    </el-card>

    <el-card shadow="never">
      <el-table v-loading="loading" :data="tableData" border>
        <el-table-column prop="id" label="ID" width="80" align="center" />
        <el-table-column prop="name" label="角色名称" min-width="140" />
        <el-table-column prop="description" label="描述" min-width="180" show-overflow-tooltip />
        <el-table-column label="权限" width="120" align="center">
          <template #default="{ row }">
            <!-- permissionText 把权限数组缩成「全部权限 / N 项权限 / 无权限」的摘要 -->
            <el-tag size="small">{{ permissionText(row as RoleItem) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" align="center" fixed="right">
          <template #default="{ row }">
            <!-- 内置的 admin 角色（超级管理员）不允许被编辑权限或删除，
                 这里用 :disabled="row.name === 'admin'" 直接把按钮置灰，从 UI 层就挡住误操作 -->
            <el-button
              v-permission="['role:edit']"
              link
              type="primary"
              :disabled="row.name === 'admin'"
              @click="openEdit(row as RoleItem)"
            >
              编辑权限
            </el-button>
            <el-button
              v-permission="['role:delete']"
              link
              type="danger"
              :disabled="row.name === 'admin'"
              @click="handleDelete(row as RoleItem)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 翻页与改每页条数分别触发不同回调 -->
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

    <!-- 新增角色弹窗 -->
    <el-dialog v-model="addVisible" title="新增角色" width="440px" :close-on-click-modal="false">
      <el-form ref="addFormRef" :model="addForm" :rules="addRules" label-width="80px">
        <el-form-item label="角色名" prop="name">
          <el-input v-model="addForm.name" placeholder="请输入角色名" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="addForm.description" placeholder="请输入角色描述" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addVisible = false">取消</el-button>
        <el-button type="primary" @click="handleAdd">确定</el-button>
      </template>
    </el-dialog>

    <!-- 编辑权限弹窗 -->
    <el-dialog v-model="editVisible" title="编辑权限" width="440px" :close-on-click-modal="false">
      <p class="tree-tip">角色：{{ currentRole?.name }}</p>
      <!-- el-tree 权限树：node-key 指定用 id 作为节点唯一标识（setCheckedKeys/getCheckedKeys 都按这个 id 工作）；
           show-checkbox 显示复选框，default-expand-all 默认展开所有分组，方便直接看到全部权限 -->
      <el-tree
        ref="treeRef"
        :data="permissionTree"
        node-key="id"
        show-checkbox
        default-expand-all
        :props="{ label: 'label', children: 'children' }"
      />
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSavePermission">保存</el-button>
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

.tree-tip {
  margin-bottom: 12px;
  color: #606266;
}
</style>
