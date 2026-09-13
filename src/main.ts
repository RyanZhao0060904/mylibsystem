// ============ 应用入口 main.ts ============
// 整个项目从这里启动，下面的 import 虽然写在顶部，但真正「先做什么、后做什么」
// 取决于各模块自身的副作用执行顺序。初始化顺序可归纳为：
//   1) 创建 Vue 应用实例；
//   2) 挂载 Pinia 并启用持久化插件（把仓库状态写回 localStorage）；
//   3) 注册路由（含动态路由能力）；
//   4) 引入 Element Plus 及其图标库；
//   5) 注册 v-permission 自定义指令（控制按钮级权限）；
//   6) 最后挂载到 index.html 的 #app 节点。
// 其中 ./mock（模拟后端）必须在业务发起请求前注册；./permission（路由守卫）必须先于任何页面组件加载。
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

import App from './App.vue'
import router from './router'
import { permission } from './directives/permission'

// 全局样式（含 Flex 布局 + 响应式媒体查询）
import './styles/index.css'
// 复古书香气主题（Element Plus 变量覆盖 + 全局暖色调）
import './styles/theme.css'
// 模拟后端接口（须在发起请求前注册）
import './mock'
// 全局路由守卫
import './permission'

const app = createApp(App)

// 挂载 pinia（含持久化插件）
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)
app.use(pinia)

// 注册路由
app.use(router)

// 引入 Element Plus
app.use(ElementPlus)

// 把 Element Plus 图标库整体注册为全局组件（按图标名注册，如 <Menu />）。
// 之所以全局注册，是因为侧边栏菜单的图标是「根据后端返回的图标名字符串动态渲染」的，
// 无法在模板里静态 import，全局注册后即可用 <component :is="iconName" /> 动态渲染。
// 全局注册图标（侧边菜单动态图标使用）
for (const [name, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(name, component)
}

// 注册 v-permission 自定义权限指令：让模板里的 <el-button v-permission="['book:add']" /> 具备
// 按钮级鉴权能力，无权限时该按钮会被直接移出 DOM（见 directives/permission.ts）。
// 注册 v-permission 自定义权限指令
app.directive('permission', permission)

app.mount('#app')
