<script setup lang="ts">
import { useRouter } from 'vue-router'

// 错误页只需一个路由实例，用来「返回首页」
const router = useRouter()
</script>

<template>
  <!-- 404：页面不存在。通常是访问了未在路由表里注册的地址，被兜底路由重定向到这里 -->
  <div class="error-page">
    <h1 class="error-code">404</h1>
    <p class="error-desc">抱歉，您访问的页面不存在</p>
    <!-- 用 replace 跳回首页，不在历史记录里留下错误页 -->
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
  color: #909399;
}

.error-desc {
  font-size: 16px;
  color: #606266;
}
</style>
