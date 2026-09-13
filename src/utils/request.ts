// ============ axios 封装 ============
// 基于 axios 创建统一的请求实例并集中处理三件事：
//   1) 请求拦截：自动从 localStorage 取 token 塞进 Authorization 头，业务层无需关心；
//   2) 响应拦截：按后端约定的统一返回结构（code/message/data）解包数据，
//      并集中处理 401(登录失效)/403(无权限)/500 等错误提示；
//   3) 提供泛型的 request/get/post 方法，让调用方拿到的是「已解包且带类型」的业务数据。
import axios, {
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { ElMessage } from 'element-plus'
import { getToken } from '@/utils/auth'
import type { ApiResult } from '@/types'

// 创建 axios 实例。baseURL 从环境变量 VITE_APP_BASE_API 读取（便于区分开发/生产地址），
// timeout 10000ms：超过 10 秒未响应即判定请求失败，避免页面一直等待。
// 创建 axios 实例
const service = axios.create({
  baseURL: import.meta.env.VITE_APP_BASE_API,
  timeout: 10000,
})

// ============ 请求拦截器 ============
service.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // 从 pinia / localStorage 取出 token，自动放到请求头 Authorization
    const token = getToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

// 401 统一处理：清除状态、跳转登录页（动态引入避免循环依赖）
// 用 handling401 布尔锁防止「多个请求同时返回 401」时弹出多条错误提示、重复登出。
// 同时这里用 import() 动态引入 user store，而不是顶部静态 import——因为 store 内部
// 会 import 本文件（request），静态引入会形成循环依赖导致拿不到模块。
let handling401 = false
async function handleUnauthorized(): Promise<void> {
  if (handling401) return
  handling401 = true
  ElMessage.error('登录状态已失效，请重新登录')
  const { useUserStore } = await import('@/stores/user')
  useUserStore().logout()
  handling401 = false
}

// ============ 响应拦截器 ============
service.interceptors.response.use(
  (response: AxiosResponse<ApiResult>): any => {
    // 二进制数据（文件下载）直接返回
    if (response.config.responseType === 'blob') {
      return response.data
    }

    const res = response.data
    // 业务 code 成功
    if (res.code === 200) {
      return res.data
    }

    // 业务 code 401：登录失效
    if (res.code === 401) {
      void handleUnauthorized()
      return Promise.reject(new Error(res.message || '登录已失效'))
    }

    // 业务 code 403：无权限
    if (res.code === 403) {
      ElMessage.error(res.message || '没有权限执行该操作')
      return Promise.reject(new Error(res.message || '无权限'))
    }

    // 其他业务错误
    ElMessage.error(res.message || '请求失败')
    return Promise.reject(new Error(res.message || '请求失败'))
  },
  (error) => {
    // HTTP 状态码 / 网络异常
    if (error.response) {
      const status: number = error.response.status
      if (status === 401) {
        void handleUnauthorized()
      } else if (status === 403) {
        ElMessage.error('没有权限访问该资源（403）')
      } else if (status === 404) {
        ElMessage.error('请求的资源不存在（404）')
      } else if (status >= 500) {
        ElMessage.error('服务器内部错误（500）')
      } else {
        ElMessage.error(`请求失败（${status}）`)
      }
    } else {
      ElMessage.error('网络异常，请检查网络连接')
    }
    return Promise.reject(error)
  },
)

// ============ 类型化请求方法（业务组件统一使用，不直接写 axios） ============
export function request<T = unknown>(config: AxiosRequestConfig): Promise<T> {
  return service.request(config) as unknown as Promise<T>
}

export function get<T = unknown>(url: string, params?: object): Promise<T> {
  return service.get(url, { params }) as unknown as Promise<T>
}

export function post<T = unknown>(url: string, data?: object): Promise<T> {
  return service.post(url, data) as unknown as Promise<T>
}

export default service
