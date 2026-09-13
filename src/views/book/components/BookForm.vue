<script setup lang="ts">
// computed 派生状态 / nextTick 等 DOM 更新 / reactive-ref 响应式 / watch 监听弹窗开关
import { computed, nextTick, reactive, ref, watch } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { BOOK_CATEGORIES } from '@/constants'
import type { BookItem } from '@/types'

// 表单数据形状：在 BookItem 基础上把价格/库存拆成数字、封面存 base64 字符串
interface BookFormData {
  id?: number
  name: string
  author: string
  isbn: string
  publisher: string
  publishDate: string
  price: number
  callNumber: string
  category: string
  stock: number
  cover: string
  description: string
}

// modelValue 控制弹窗显隐；book 为 null 表示新增，非 null 表示编辑（携带回显数据）
const props = defineProps<{ modelValue: boolean; book: BookItem | null }>()
// 声明两个事件：update:modelValue 用于把弹窗显隐同步回父组件，save 用于提交表单数据
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; save: [data: BookFormData] }>()

// formRef 绑定 el-form，用来 validate / resetFields / clearValidate
const formRef = ref<FormInstance>()
// fileInput 绑定隐藏的 <input type="file">，点击封面框时用代码触发它打开文件选择
const fileInput = ref<HTMLInputElement>()
// submitting：提交进行中为 true，防止连点重复提交
const submitting = ref(false)

// 是否有编辑对象 → 决定弹窗标题是「编辑图书」还是「新增图书」
const isEdit = computed(() => !!props.book)

// defaultForm：生成一份全新的空表单，新增或重置时用
const defaultForm = (): BookFormData => ({
  name: '',
  author: '',
  isbn: '',
  publisher: '',
  publishDate: '',
  price: 0,
  callNumber: '',
  category: '',
  stock: 0,
  cover: '',
  description: '',
})

const form = reactive<BookFormData>(defaultForm())

// 状态由库存自动判定（库存 > 0 → 在库，否则借出）
// 用 computed 派生而不是存字段：库存一变状态立刻跟着变，避免两处数据不一致
const derivedStatus = computed(() => (form.stock > 0 ? '在库' : '借出'))

// 完整表单校验
// rules 与 el-form 的 :rules 绑定，每个 key 对应 form-item 的 prop
// trigger: 'blur' 失焦时校验，'change' 是下拉/选择类控件值变化时校验
const rules: FormRules = {
  name: [{ required: true, message: '请输入图书名称', trigger: 'blur' }],
  author: [{ required: true, message: '请输入作者', trigger: 'blur' }],
  category: [{ required: true, message: '请选择分类', trigger: 'change' }],
}

// 打开弹窗时：新增重置 / 编辑回显
// 监听 modelValue：弹窗从关→开时做数据准备，从开→关时不用处理（关闭逻辑在 handleClose 里）
watch(
  () => props.modelValue,
  (visible) => {
    if (visible) {
      if (props.book) {
        // 编辑：把父组件传进来的图书数据合并进 form，实现回显
        Object.assign(form, props.book)
      } else {
        // 新增：重置为一份空表单
        Object.assign(form, defaultForm())
      }
      // 等弹窗/表单 DOM 渲染完成后再清除上一次的校验提示，避免残留红字
      nextTick(() => formRef.value?.clearValidate())
    }
  },
)

function handleClose() {
  // 通知父组件把 modelValue 置为 false，让弹窗关闭
  emit('update:modelValue', false)
  // 关闭弹窗重置表单、清除校验提示，防止编辑残留数据带到新增
  // resetFields 会把表单重置回初始值并清掉校验状态
  formRef.value?.resetFields()
  Object.assign(form, defaultForm())
}

// HTML5 FileReader 图片上传预览
// 思路：不走真实上传接口，而是把选中图片读成 base64 字符串直接存进 form.cover；
// 后端 mock 把 cover 当普通字符串存取，列表/详情页用 <img :src> 直接展示即可
function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  // 取用户选中的第一个文件；用户取消选择时 files 为空或长度为 0
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  // readAsDataURL 是异步的：读完后触发 onload，result 是 "data:image/...;base64,..." 字符串
  reader.onload = () => {
    form.cover = reader.result as string
  }
  reader.readAsDataURL(file)
  // 清空 input.value：这样下次再选同一张图，change 事件仍会触发（值没变化就不会触发）
  input.value = ''
}

function removeCover() {
  // 移除封面：清空 cover 即可，模板里 v-if 会自动切回「上传封面」占位图
  form.cover = ''
}

// 提交：先整体校验，通过后把表单数据交给父组件去调接口
async function handleSubmit() {
  if (!formRef.value || submitting.value) return
  try {
    await formRef.value.validate()
  } catch {
    // 校验不通过直接返回，不发请求
    return
  }

  submitting.value = true
  try {
    emit('save', {
      ...form,
      // id 优先取 form 里的，其次取编辑对象 id（保证编辑场景 id 正确）
      id: form.id ?? props.book?.id,
      // el-input-number 可能返回字符串，这里显式转成数字再提交
      stock: Number(form.stock),
      price: Number(form.price),
    })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <!-- 弹窗：:model-value 受控显隐，@update:model-value 监听关闭（点右上角 X / 遮罩） -->
  <!-- :close-on-click-modal="false" 禁止点遮罩关闭，防止误操作丢失已填内容 -->
  <el-dialog
    :model-value="modelValue"
    :title="isEdit ? '编辑图书' : '新增图书'"
    width="640px"
    :close-on-click-modal="false"
    @update:model-value="handleClose"
  >
    <!-- 表单：ref 供脚本校验/重置，:model 绑定表单数据，:rules 绑定校验规则 -->
    <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
      <!-- prop 必须与 rules 中的 key 一致，否则校验规则不生效 -->
      <el-form-item label="书名" prop="name">
        <el-input v-model="form.name" placeholder="请输入图书名称" />
      </el-form-item>

      <el-form-item label="作者" prop="author">
        <el-input v-model="form.author" placeholder="请输入作者" />
      </el-form-item>

      <!-- el-row / el-col 栅格布局：gutter 是列间距，两列各占一半宽度 -->
      <el-row :gutter="12">
        <el-col :span="12">
          <el-form-item label="分类" prop="category">
            <!-- 下拉：选项来自常量 BOOK_CATEGORIES，v-for 循环渲染 -->
            <el-select v-model="form.category" placeholder="请选择分类" style="width: 100%">
              <el-option v-for="c in BOOK_CATEGORIES" :key="c" :label="c" :value="c" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <!-- 库存没有 prop/rules，属于选填，只限制 0~9999 -->
          <el-form-item label="库存">
            <el-input-number v-model="form.stock" :min="0" :max="9999" style="width: 100%" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item label="ISBN">
        <el-input v-model="form.isbn" placeholder="请输入 ISBN（如 978-7-111-54493-7）" />
      </el-form-item>

      <el-form-item label="出版社">
        <el-input v-model="form.publisher" placeholder="请输入出版社" />
      </el-form-item>

      <el-row :gutter="12">
        <el-col :span="12">
          <el-form-item label="出版日期">
            <el-date-picker
              v-model="form.publishDate"
              type="date"
              value-format="YYYY-MM-DD"
              placeholder="选择出版日期"
              style="width: 100%"
            />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="价格">
            <el-input-number v-model="form.price" :min="0" :precision="2" style="width: 100%" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item label="索书号">
        <el-input v-model="form.callNumber" placeholder="请输入索书号（如 TP3/1001）" />
      </el-form-item>

      <!-- 状态不是输入项，只是展示 computed 派生结果，让用户知道库存如何影响状态 -->
      <el-form-item label="状态">
        <el-tag :type="derivedStatus === '在库' ? 'success' : 'danger'" size="small">
          {{ derivedStatus }}
        </el-tag>
        <span class="status-hint">状态由库存自动判定，无需手工录入</span>
      </el-form-item>

      <!-- 封面上传：点封面框触发隐藏的 file input 打开文件选择，选完 FileReader 转 base64 预览 -->
      <el-form-item label="封面">
        <div class="cover-wrap">
          <!-- fileInput?.click()：用 JS 主动点击隐藏的 input，从而自定义上传入口外观 -->
          <div class="cover-box" @click="fileInput?.click()">
            <img v-if="form.cover" :src="form.cover" class="cover-img" alt="封面" />
            <div v-else class="cover-placeholder">
              <el-icon :size="24"><Plus /></el-icon>
              <span>上传封面</span>
            </div>
          </div>
          <el-button v-if="form.cover" link type="danger" @click="removeCover">移除封面</el-button>
        </div>
        <!-- 真正负责选文件的 input 被隐藏（class="hidden-input"），由封面框代点 -->
        <!-- accept="image/*" 限制只能选择图片类型的文件 -->
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          class="hidden-input"
          @change="handleFileChange"
        />
      </el-form-item>

      <el-form-item label="简介">
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="3"
          placeholder="请输入图书简介"
        />
      </el-form-item>
    </el-form>

    <!-- #footer 插槽：自定义弹窗底部按钮；提交按钮 loading 中禁用，防重复提交 -->
    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">
        {{ isEdit ? '保存' : '新增' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.cover-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
}

.cover-box {
  width: 96px;
  height: 128px;
  border: 1px dashed #dcdfe6;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  overflow: hidden;
}

.cover-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  color: #909399;
  font-size: 12px;
}

.cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.hidden-input {
  display: none;
}

.status-hint {
  margin-left: 8px;
  color: #909399;
  font-size: 12px;
}
</style>
