<script setup lang="ts">
// ============ 布局入口：组合侧边栏 + 顶部栏 + 内容区 ============
// 本组件是整个后台系统的"外壳"，只负责页面骨架的摆放与折叠状态管理；
// 具体的菜单、面包屑、用户操作分别交给 Sidebar / Navbar / Breadcrumb 子组件。
import { onBeforeUnmount, onMounted, ref } from 'vue'
import Sidebar from './components/Sidebar.vue'
import Navbar from './components/Navbar.vue'

const isCollapse = ref(false)

// isCollapse 是整个布局"折叠"状态的唯一数据源：
// true = 侧边栏收起为 64px（只显示图标），false = 展开为 210px。
// 它同时下发给 Sidebar（控制菜单收起）和 Navbar（控制折叠按钮图标），保证三处同步。
// 响应式：小屏自动折叠侧边栏
// 768px 是常见的小屏断点：窗口宽度小于它时自动收起侧栏，
// 避免侧栏挤占正文空间；恢复大屏后自动展开。
function handleResize() {
  isCollapse.value = window.innerWidth < 768
}

// 挂载时先按当前窗口宽度初始化一次折叠状态，再注册 resize 监听，
// 之后用户拖拽改变窗口大小时，折叠状态会实时跟随。
onMounted(() => {
  handleResize()
  window.addEventListener('resize', handleResize)
})

// 卸载前必须移除 resize 监听：手动 addEventListener 的事件不会随组件自动清理，
// 不移除会造成内存泄漏，甚至组件销毁后监听函数仍被触发而报错。
onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
})
</script>

<template>
  <!-- 最外层 el-container：横向排列，左 aside + 右 body -->
  <el-container class="layout">
    <!-- 左侧侧边栏 -->
    <!-- :width 绑定折叠状态动态切换 64px / 210px，配合 CSS 的 transition 实现平滑收放 -->
    <el-aside :width="isCollapse ? '64px' : '210px'" class="layout-aside">
      <!-- Logo 区：折叠时用 v-show 隐藏文字只留图标，避免文字溢出窄侧栏 -->
      <div class="layout-logo">
        <el-icon :size="22" color="#c9a06b"><Reading /></el-icon>
        <span v-show="!isCollapse" class="layout-logo-text">图书借阅管理系统</span>
      </div>
      <!-- 把折叠状态传给 Sidebar，让它决定菜单收起还是展开 -->
      <Sidebar :collapse="isCollapse" />
    </el-aside>

    <!-- 右侧主体 -->
    <!-- 右侧嵌套一个 el-container 纵向排列：上 header 下 main -->
    <el-container class="layout-body">
      <el-header class="layout-header" height="56px">
        <!-- @toggle：子组件点击折叠按钮时触发，取反即可切换折叠状态 -->
        <Navbar :collapse="isCollapse" @toggle="isCollapse = !isCollapse" />
      </el-header>

      <el-main class="layout-main">
        <!-- router-view：内容区占位，根据当前路由渲染对应的页面组件 -->
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
/* ============ 布局样式（暖墨色复古主题） ============ */
/* scoped 让这些样式只作用于当前组件，不会污染全局 */
.layout {
  /* 占满父容器：外层（通常是 App.vue）已保证高度 100% */
  height: 100%;
  width: 100%;
}

.layout-aside {
  /* 侧栏底色 #2e2a24：暖墨色复古主题的基调色 */
  background-color: #2e2a24;
  /* width 过渡动画：折叠/展开时宽度变化更平滑 */
  transition: width 0.28s;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.layout-logo {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #f3ead8;
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
}

.layout-logo-text {
  overflow: hidden;
  text-overflow: ellipsis;
}

.layout-body {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.layout-header {
  background-color: #fdfaf3;
  border-bottom: 1px solid #e3d8c3;
  padding: 0 16px;
  display: flex;
  align-items: center;
}

.layout-main {
  background-color: #f6f1e7;
  padding: 16px;
  overflow: auto;
}
</style>
