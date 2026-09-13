<script setup lang="ts">
// onMounted：进入页面立即请求详情；ref：声明响应式状态
import { onMounted, ref } from 'vue'
// useRoute 读取当前路由参数（详情页的 :id），useRouter 用于返回列表
import { useRoute, useRouter } from 'vue-router'
import { getBookDetail } from '@/api/book'
import type { BookItem } from '@/types'

const route = useRoute()
const router = useRouter()

const loading = ref(false)
// book 初始为 null：模板用 v-if="book" 判断是否已加载到数据再渲染
const book = ref<BookItem | null>(null)

// 拉取详情：从路由参数里取 id，请求后端拿到单本图书信息
async function fetchDetail() {
  // 路由参数默认是字符串，转成数字；转换失败会得到 NaN
  const id = Number(route.params.id)
  if (!id) {
    // id 非法（NaN 为假值）时直接回列表页，避免请求一个无效的详情接口
    router.replace('/book/list')
    return
  }
  loading.value = true
  try {
    book.value = await getBookDetail(id)
  } finally {
    loading.value = false
  }
}

onMounted(fetchDetail)
</script>

<template>
  <!-- 整个详情页容器，v-loading 在请求中显示加载遮罩 -->
  <div class="book-detail" v-loading="loading">
    <el-card shadow="never">
      <!-- #header 插槽：自定义卡片头部，放标题和返回按钮 -->
      <template #header>
        <div class="flex-between">
          <span>图书详情</span>
          <el-button @click="router.push('/book/list')">
            <el-icon><Back /></el-icon>返回列表
          </el-button>
        </div>
      </template>

      <!-- 有数据才渲染详情，否则（加载完成后）显示 el-empty 未找到提示 -->
      <div v-if="book" class="detail-body">
        <!-- 左侧封面区：有封面显示图片（可点击放大），无封面显示占位 -->
        <div class="detail-cover">
          <el-image
            v-if="book.cover"
            :src="book.cover"
            :preview-src-list="[book.cover]"
            fit="cover"
            preview-teleported
            class="cover-img"
          />
          <div v-else class="cover-empty">
            <el-icon :size="40"><Picture /></el-icon>
            <span>暂无封面</span>
          </div>
        </div>

        <!-- 右侧信息区：el-descriptions 描述列表，:column="2" 一行两列 -->
        <el-descriptions :column="2" border class="detail-info">
          <el-descriptions-item label="书名">{{ book.name }}</el-descriptions-item>
          <el-descriptions-item label="作者">{{ book.author }}</el-descriptions-item>
          <el-descriptions-item label="分类">{{ book.category }}</el-descriptions-item>
          <el-descriptions-item label="索书号">{{ book.callNumber || '—' }}</el-descriptions-item>
          <el-descriptions-item label="ISBN">{{ book.isbn || '—' }}</el-descriptions-item>
          <el-descriptions-item label="出版社">{{ book.publisher || '—' }}</el-descriptions-item>
          <el-descriptions-item label="出版日期">{{ book.publishDate || '—' }}</el-descriptions-item>
          <el-descriptions-item label="价格">￥{{ book.price }}</el-descriptions-item>
          <el-descriptions-item label="库存">{{ book.stock }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="book.status === '在库' ? 'success' : 'danger'" size="small">
              {{ book.status }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ book.createTime }}</el-descriptions-item>
          <el-descriptions-item label="简介" :span="2">{{ book.description || '暂无简介' }}</el-descriptions-item>
        </el-descriptions>
      </div>

      <!-- 数据为空且不在加载中：显示「未找到该图书」占位 -->
      <el-empty v-else-if="!loading" description="未找到该图书" />
    </el-card>
  </div>
</template>

<style scoped>
.detail-body {
  display: flex;
  gap: 24px;
}

.detail-cover {
  width: 200px;
  flex-shrink: 0;
}

.cover-img {
  width: 200px;
  height: 270px;
  border-radius: 6px;
}

.cover-empty {
  width: 200px;
  height: 270px;
  border: 1px dashed #dcdfe6;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #c0c4cc;
}

.detail-info {
  flex: 1;
}

@media screen and (max-width: 768px) {
  .detail-body {
    flex-direction: column;
  }
}
</style>
