<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import { changePassword } from '@/api/user'
import { useUserStore } from '@/stores/user'

// ============ 页面说明 ============
// 本页是「个人中心」：展示当前登录用户的信息，并提供修改密码功能。
// 用户信息不直接请求接口，而是从 Pinia 的 userStore 里读（登录时已存好）。

const userStore = useUserStore()

// 角色名称映射（仅展示）
// 把角色英文标识转成中文，只在页面上显示用，不参与任何逻辑判断
const roleNameMap: Record<string, string> = {
  admin: '超级管理员',
  lib: '图书馆管理员',
}

// 计算属性：取用户第一个角色（本系统一个用户只有一个角色），映射成中文；查不到就显示原值
const roleName = computed(() => {
  const role = userStore.roles[0] ?? ''
  return roleNameMap[role] ?? role
})

// ============ 修改密码 ============
const pwdFormRef = ref<FormInstance>()
// 提交中标记，防止连点
const pwdSubmitting = ref(false)
const pwdForm = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' })

// 自定义校验器：校验「确认密码」是否和「新密码」一致。
// 三个参数是 Element Plus 校验器的固定签名：rule 规则、value 当前值、callback 通过/报错的回调
const validateConfirm = (_rule: unknown, value: string, callback: (error?: Error) => void) => {
  if (value !== pwdForm.newPassword) {
    // 不一致时给 callback 传一个 Error，表单会把它当作校验失败并显示 message
    callback(new Error('两次输入的密码不一致'))
  } else {
    // 一致则调用空参数的 callback 表示校验通过
    callback()
  }
}

// 校验规则：旧密码必填；新密码必填且至少 6 位；确认密码必填，并额外用自定义 validator 校验两次输入一致
const pwdRules: FormRules = {
  oldPassword: [{ required: true, message: '请输入旧密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '密码长度至少 6 位', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    { validator: validateConfirm, trigger: 'blur' },
  ],
}

async function handleChangePassword() {
  if (!pwdFormRef.value || pwdSubmitting.value) return
  try {
    // 前端先做一次完整校验（含两次密码一致）；旧密码是否正确由后端/ mock 校验
    await pwdFormRef.value.validate()
  } catch {
    return
  }
  pwdSubmitting.value = true
  try {
    // 前端校验通过后提交，若旧密码错误，changePassword 会抛错并被上层提示
    await changePassword({ oldPassword: pwdForm.oldPassword, newPassword: pwdForm.newPassword })
    ElMessage.success('密码修改成功')
    // 成功后清空表单；resetFields 会把值还原为初始值，这里再手动清一遍确保三个字段都为空
    pwdFormRef.value.resetFields()
    pwdForm.oldPassword = ''
    pwdForm.newPassword = ''
    pwdForm.confirmPassword = ''
  } finally {
    pwdSubmitting.value = false
  }
}
</script>

<template>
  <div class="personal">
    <div class="personal-body">
      <el-card class="personal-card" shadow="never">
        <template #header>
          <div class="flex-between">
            <span>个人信息</span>
            <!-- 角色名来自计算属性 roleName，展示为高亮标签 -->
            <el-tag type="primary">{{ roleName }}</el-tag>
          </div>
        </template>

        <!-- el-descriptions 描述列表：以「标签-值」形式展示用户信息，:column="1" 表示单列纵向排列 -->
        <el-descriptions :column="1" border>
          <el-descriptions-item label="用户名">
            <span class="flex-center" style="gap: 8px">
              <el-icon><User /></el-icon>
              {{ userStore.username }}
            </span>
          </el-descriptions-item>
          <el-descriptions-item label="昵称">{{ userStore.nickname }}</el-descriptions-item>
          <el-descriptions-item label="所属角色">{{ roleName }}</el-descriptions-item>
        </el-descriptions>
      </el-card>

      <el-card class="personal-card" shadow="never">
        <template #header>
          <span>修改密码</span>
        </template>

        <el-form ref="pwdFormRef" :model="pwdForm" :rules="pwdRules" label-width="80px">
          <el-form-item label="旧密码" prop="oldPassword">
            <el-input v-model="pwdForm.oldPassword" type="password" show-password placeholder="请输入旧密码" />
          </el-form-item>
          <el-form-item label="新密码" prop="newPassword">
            <el-input v-model="pwdForm.newPassword" type="password" show-password placeholder="请输入新密码（至少 6 位）" />
          </el-form-item>
          <el-form-item label="确认密码" prop="confirmPassword">
            <el-input
              v-model="pwdForm.confirmPassword"
              type="password"
              show-password
              placeholder="请再次输入新密码"
              @keyup.enter="handleChangePassword"
            />
          </el-form-item>
          <el-form-item>
            <!-- :loading="pwdSubmitting" 让按钮在请求期间显示加载状态，防止重复提交 -->
            <el-button type="primary" :loading="pwdSubmitting" @click="handleChangePassword">
              确认修改
            </el-button>
          </el-form-item>
        </el-form>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.personal {
  display: flex;
  justify-content: center;
}

.personal-body {
  width: 520px;
  max-width: 100%;
}

.personal-card {
  width: 100%;
}

.personal-card + .personal-card {
  margin-top: 16px;
}
</style>
