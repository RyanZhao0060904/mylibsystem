<script setup lang="ts">
// ============ 顶部导航栏：折叠按钮 + 面包屑 + 用户下拉菜单 ============
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { useUserStore } from '@/stores/user'
import Breadcrumb from './Breadcrumb.vue'

// collapse 决定折叠按钮显示 Expand（展开）还是 Fold（收起）图标
defineProps<{ collapse: boolean }>()
// toggle 事件：点击折叠按钮时通知父组件 index.vue 切换 isCollapse
const emit = defineEmits<{ (e: 'toggle'): void }>()

const router = useRouter()
const userStore = useUserStore()

// 优先显示昵称，未设置昵称时回退到用户名
const nickname = computed(() => userStore.nickname || userStore.username)

// el-dropdown 的 @command 回调：根据菜单项上声明的 command 值分发不同处理
async function handleCommand(command: string) {
  if (command === 'personal') {
    // 个人中心：直接跳转路由
    router.push('/personal')
    return
  }
  if (command === 'logout') {
    try {
      // ElMessageBox.confirm 返回 Promise：点"确定"走 resolve，点"取消"或关闭走 reject，
      // 所以用 try/catch 区分"确认退出"和"取消操作"两种结果。
      await ElMessageBox.confirm('确定要退出登录吗？', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      })
    } catch {
      // 用户取消或关闭弹窗：直接返回，不执行退出
      return
    }
    // 退出登录：清空状态、重置路由，跳转登录页
    // logout 内部会清空 user store 中的 token 和用户信息，
    // 并重置动态路由后跳转到登录页，下次进入需重新登录。
    userStore.logout()
  }
}
</script>

<template>
  <div class="navbar flex-between">
    <!-- 左侧：折叠按钮 + 面包屑 -->
    <div class="flex-center">
      <!-- 点击折叠按钮向父组件发 toggle 事件；图标按折叠状态在 Expand / Fold 间切换 -->
      <el-icon class="collapse-btn" :size="20" @click="emit('toggle')">
        <Expand v-if="collapse" />
        <Fold v-else />
      </el-icon>
      <Breadcrumb />
    </div>

    <!-- 右侧：用户信息下拉菜单，trigger="click" 表示点击触发 -->
    <el-dropdown trigger="click" @command="handleCommand">
      <span class="user-info flex-center">
        <el-icon :size="18"><UserFilled /></el-icon>
        <span class="user-name">{{ nickname }}</span>
        <el-icon><ArrowDown /></el-icon>
      </span>
      <!-- #dropdown 插槽：下拉面板内容 -->
      <template #dropdown>
        <el-dropdown-menu>
          <!-- command 用于在 handleCommand 里区分点了哪一项 -->
          <el-dropdown-item command="personal">
            <el-icon><User /></el-icon>个人中心
          </el-dropdown-item>
          <!-- divided 在该项上方加一条分隔线 -->
          <el-dropdown-item command="logout" divided>
            <el-icon><SwitchButton /></el-icon>退出登录
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<style scoped>
/* ============ 导航栏样式 ============ */
.navbar {
  /* 撑满 el-header 内部空间，配合 flex-between 让左右两端对齐 */
  width: 100%;
  height: 100%;
}

.collapse-btn {
  /* 手型光标提示可点击 */
  cursor: pointer;
  margin-right: 12px;
  color: #606266;
}

.user-info {
  cursor: pointer;
  gap: 4px;
  color: #303133;
  font-size: 14px;
}

.user-name {
  /* 限制最大宽度并省略超长用户名，避免挤乱布局 */
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
