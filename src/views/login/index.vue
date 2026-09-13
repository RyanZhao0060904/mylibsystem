<script setup lang="ts">
// ============ 依赖引入 ============
// reactive / ref：Vue 3 组合式 API，分别创建「响应式对象」和「响应式基础值」
import { reactive, ref } from 'vue'
// useRouter：拿到路由实例，登录成功后用 router.replace('/') 跳转到首页
import { useRouter } from 'vue-router'
// FormInstance / FormRules：Element Plus 表单组件实例类型与校验规则类型
import type { FormInstance, FormRules } from 'element-plus'
// ElMessage：非组件形式的轻量消息提示（成功/失败），直接调用函数即可弹出
import { ElMessage } from 'element-plus'
// Lock / User：用户名、密码输入框左侧的图标组件
import { Lock, User } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import { usePermissionStore } from '@/stores/permission'

// ============ 初始化 ============
// 路由实例 + 两个 Pinia store（用户信息、权限/动态路由），供下面逻辑使用
const router = useRouter()
const userStore = useUserStore()
const permissionStore = usePermissionStore()

// ============ 表单相关状态 ============
// formRef：绑定到 <el-form ref="formRef"> 的组件实例，用来调用 validate() 做整体校验
const formRef = ref<FormInstance>()
// loading：登录请求进行中为 true，用于禁用按钮、显示「登录中...」并防止重复提交
const loading = ref(false)

// 登录表单数据（reactive 包裹后，模板里 v-model 双向绑定到这里）
// 预填 admin / 123456 是测试账号，方便课程演示时直接登录
const form = reactive({
  username: 'admin',
  password: '123456',
})

// ============ 表单校验规则 ============
// 完整表单校验：不能为空
// rules 通过 el-form 的 :rules 绑定；每一项的 key 要与 form-item 的 prop 同名才能生效
// trigger: 'blur' 表示「输入框失焦时」触发该校验
const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

// ============ 登录流程 ============
// 登录是「串行」流程：先登录拿 token → 再拉用户信息 → 最后生成动态路由，
// 三者必须按顺序完成，否则进入首页时会缺少用户数据或菜单/权限
async function handleLogin() {
  // 兜底判断：表单实例未挂载，或已在登录中，直接返回，避免重复提交
  if (!formRef.value || loading.value) return
  // 校验不通过则不发起请求
  try {
    // validate() 返回 Promise：校验通过 resolve，失败 reject
    await formRef.value.validate()
  } catch {
    // 校验失败（有必填项为空）会走到这里，直接 return，不再执行登录请求
    return
  }

  loading.value = true
  try {
    // 依次执行：登录 → 获取用户信息 → 根据权限生成动态路由
    await userStore.login({ username: form.username, password: form.password })
    await userStore.getUserInfo()
    await permissionStore.generateRoutes()
    ElMessage.success('登录成功')
    // replace 而不是 push：登录页不应保留在浏览器历史里，回退时不会再回到登录页
    router.replace('/')
  } catch {
    // 登录失败提示由响应拦截器统一处理
  } finally {
    // 无论成功失败都要关闭 loading，恢复按钮可用状态
    loading.value = false
  }
}
</script>

<template>
  <!-- 登录页整体：外层 main 铺满剩余区域并居中显示卡片 -->
  <main class="login-page">
    <!-- 登录卡片：承载标题、表单和测试账号提示 -->
    <section class="login-card">
      <!-- 页头：图书图标 + 中英文标题 -->
      <header class="login-header">
        <el-icon :size="32" color="#c9a06b"><Reading /></el-icon>
        <h1 class="login-title">图书借阅后台管理系统</h1>
        <p class="login-subtitle">Library Management System</p>
      </header>

      <!-- 登录表单：ref 绑定 formRef 供脚本校验，:model 绑定数据，:rules 绑定校验规则 -->
      <!-- @submit.prevent 阻止回车时原生表单提交导致页面刷新，改用按钮 click 提交 -->
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        size="large"
        @submit.prevent
      >
        <!-- prop 与 rules 里的 key 对应，触发校验时按这个 key 找到对应规则 -->
        <el-form-item label="用户名" prop="username">
          <!-- 输入框内回车也能触发登录，提升操作体验 -->
          <el-input
            v-model="form.username"
            placeholder="请输入用户名"
            :prefix-icon="User"
            clearable
            @keyup.enter="handleLogin"
          />
        </el-form-item>

        <el-form-item label="密码" prop="password">
          <!-- type="password" 隐藏输入内容，show-password 提供眼睛图标切换明文/密文 -->
          <el-input
            v-model="form.password"
            type="password"
            placeholder="请输入密码"
            :prefix-icon="Lock"
            show-password
            @keyup.enter="handleLogin"
          />
        </el-form-item>

        <!-- loading 状态时按钮自带转圈并禁用，文案也切换为「登录中...」 -->
        <el-button
          type="primary"
          class="login-btn"
          :loading="loading"
          :disabled="loading"
          @click="handleLogin"
        >
          {{ loading ? '登录中...' : '登 录' }}
        </el-button>
      </el-form>

      <!-- 页脚：展示测试账号，方便课程演示时直接复制使用 -->
      <footer class="login-tips">
        <p>测试账号：admin / lib（密码均为 123456）</p>
      </footer>
    </section>
  </main>
</template>

<style scoped>
.login-page {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  /* 图片背景上叠加一层暖褐滤镜，营造旧书封质感 */
  background:
    linear-gradient(rgba(46, 40, 32, 0.55), rgba(46, 40, 32, 0.45)),
    url('../../assets/login-bg.jpg') center / cover no-repeat;
}

.login-card {
  width: 380px;
  max-width: 92%;
  background: #fdfaf3;
  border: 1px solid #e3d8c3;
  border-radius: 8px;
  padding: 36px 32px 24px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
}

.login-header {
  text-align: center;
  margin-bottom: 24px;
}

.login-title {
  font-size: 22px;
  color: #3a3226;
  margin-top: 12px;
  font-family: 'Georgia', 'Times New Roman', 'STSong', 'Songti SC', 'Noto Serif SC', 'SimSun', serif;
  letter-spacing: 1px;
}

.login-subtitle {
  color: #7a6f5c;
  font-size: 13px;
  margin-top: 6px;
  letter-spacing: 0.5px;
}

.login-btn {
  width: 100%;
}

.login-tips {
  margin-top: 20px;
  text-align: center;
  color: #a89b82;
  font-size: 12px;
}
</style>
