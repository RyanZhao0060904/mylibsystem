<script setup lang="ts">
// ============ 侧边栏：根据权限路由动态生成菜单 ============
// 菜单不是写死的，而是来自权限 store 的 accessRoutes（登录后按角色注入的
// 可访问路由表），因此不同角色登录会看到不同的菜单。
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { usePermissionStore } from '@/stores/permission'
import type { RouteNode } from '@/types'

// collapse 由父组件 index.vue 传入，控制菜单收起/展开
defineProps<{ collapse: boolean }>()

// route 用于高亮当前激活的菜单项
const route = useRoute()
const permissionStore = usePermissionStore()

// 过滤 hidden 菜单项，动态渲染侧边菜单
// 这里做两件事：
// 1. 递归过滤掉 meta.hidden 为 true 的节点——有些路由需要注册但不出现在菜单
//    （例如"新增/详情"这类从列表页进入、不需要独立入口的页面）；
// 2. 若某个父级的子级被全部过滤，则该父级不再有子菜单，一并移除，避免出现空分组。
const menus = computed<RouteNode[]>(() => {
  // visible 是递归函数：先过滤自身 hidden，再对 children 递归做同样处理
  const visible = (nodes: RouteNode[]): RouteNode[] =>
    nodes
      .filter((node) => !node.meta.hidden)
      .map((node) => (node.children ? { ...node, children: visible(node.children) } : node))
      .filter((node) => !node.children || node.children.length > 0)
  // computed 会自动缓存：accessRoutes 不变时不会重复计算，提升渲染性能
  return visible(permissionStore.accessRoutes)
})

// 拼接子路由的完整路径，作为菜单项的跳转地址。
// 子路由的 path 通常是相对路径（如 'list'），需要和父路径拼成 '/book/list'；
// 若子路由本身是绝对路径（以 / 开头）则直接使用；
// 最后的 replace(/\/+/g, '/') 用于把拼接时可能出现的连续斜杠合并成一个。
function resolvePath(base: string, path: string): string {
  if (path.startsWith('/')) return path
  return `${base}/${path}`.replace(/\/+/g, '/')
}
</script>

<template>
  <!-- el-scrollbar：菜单项过多时可滚动，避免撑破容器 -->
  <el-scrollbar class="sidebar-scroll">
    <!--
      el-menu 是侧边菜单：
      - default-active 绑定当前路由路径，自动高亮对应菜单项；
      - router 模式让点击菜单直接以 index 作为路径跳转，无需手动监听 click；
      - 三个 color 分别控制菜单底色、普通文字色、选中高亮文字色。
    -->
    <el-menu
      :default-active="route.path"
      :collapse="collapse"
      :collapse-transition="false"
      router
      class="sidebar-menu"
      background-color="#2e2a24"
      text-color="#c9bda5"
      active-text-color="#e8c99b"
    >
      <template v-for="item in menus" :key="item.path">
        <!-- 有子菜单 -->
        <!-- 有 children 就渲染为可展开的分组，index 用父级 path 作为分组标识 -->
        <el-sub-menu v-if="item.children && item.children.length" :index="item.path">
          <template #title>
            <!-- icon 是路由 meta 里保存的组件引用，用 <component :is> 动态渲染对应图标 -->
            <el-icon v-if="item.meta.icon"><component :is="item.meta.icon" /></el-icon>
            <span>{{ item.meta.title }}</span>
          </template>
          <!-- 子项：index 即跳转路径，相对路径需通过 resolvePath 拼成完整路径 -->
          <el-menu-item
            v-for="child in item.children"
            :key="child.path"
            :index="resolvePath(item.path, child.path)"
          >
            <el-icon v-if="child.meta.icon"><component :is="child.meta.icon" /></el-icon>
            <template #title>{{ child.meta.title }}</template>
          </el-menu-item>
        </el-sub-menu>

        <!-- 单个菜单项 -->
        <!-- 没有 children 时走 v-else，直接渲染为可点击菜单项 -->
        <el-menu-item v-else :index="item.path">
          <el-icon v-if="item.meta.icon"><component :is="item.meta.icon" /></el-icon>
          <template #title>{{ item.meta.title }}</template>
        </el-menu-item>
      </template>
    </el-menu>
  </el-scrollbar>
</template>

<style scoped>
/* ============ 侧边栏样式 ============ */
/* scoped：样式只作用于本组件 */
.sidebar-scroll {
  /* flex: 1 让滚动区占据侧栏剩余高度（Logo 区固定 56px） */
  flex: 1;
  height: 100%;
}

.sidebar-menu {
  /* 去掉 el-menu 默认的右边框，保持侧栏整体干净 */
  border-right: none;
  /* 悬停底色：Element Plus 默认取主色浅色，在深色侧栏上过亮，改成轻微提亮的墨色 */
  --el-menu-hover-bg-color: #3b352c;
}

/* 展开状态固定 210px 宽；折叠状态由 el-menu 自身收缩，无需额外处理 */
.sidebar-menu:not(.el-menu--collapse) {
  width: 210px;
}
</style>
