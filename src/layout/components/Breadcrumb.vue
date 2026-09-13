<script setup lang="ts">
// ============ 面包屑：根据路由层级自动生成 ============
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

// 根据当前路由 matched 自动生成面包屑，不写死文本
// route.matched 是 Vue Router 提供的"当前路由匹配到的所有父级路由记录"数组，
// 例如访问 /book/list 时通常能匹配到 [layout, book, list] 等层级。
// 这里过滤出"有 meta.title 且未被 hidden 隐藏"的层级，只保留需要在面包屑展示的节点，
// 所以面包屑会随路由层级自动变化，不需要在页面里手动维护文本。
const breadcrumbs = computed(() =>
  route.matched.filter((item) => item.meta && item.meta.title && !item.meta.hidden),
)
</script>

<template>
  <!-- separator 指定面包屑层级间的分隔符（这里是斜杠） -->
  <el-breadcrumb separator="/" class="breadcrumb">
    <el-breadcrumb-item v-for="item in breadcrumbs" :key="item.path">
      {{ item.meta.title }}
    </el-breadcrumb-item>
  </el-breadcrumb>
</template>

<style scoped>
/* 禁止换行，保证面包屑始终单行显示；超长时由父容器（navbar 左侧）截断处理 */
.breadcrumb {
  white-space: nowrap;
}
</style>
