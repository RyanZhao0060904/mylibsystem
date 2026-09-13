<script setup lang="ts">
import { useRouter } from 'vue-router'

// 错误页只需一个路由实例，用来「返回首页」
const router = useRouter()
</script>

<template>
  <!-- 403：无权限访问。通常由路由守卫判定当前用户没有访问权限后跳转到此页 -->
  <div class="error-page">
    <h1 class="error-code">403</h1>
    <p class="error-desc">抱歉，您没有权限访问该页面</p>
    <!-- router.replace 而不是 push：不往历史栈里多塞一条，避免按返回键又回到错误页 -->
    <el-button type="primary" @click="router.replace('/')">返回首页</el-button>
  </div>
</template>

<style scoped>
.error-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  background: #fff;
}

.error-code {
  font-size: 96px;
  color: #e6a23c;
}

.error-desc {
  font-size: 16px;
  color: #606266;
}
</style>
