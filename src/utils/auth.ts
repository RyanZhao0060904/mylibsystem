// ============ token 本地存储管理 ============
// 说明：token 同时存在 pinia（persist 持久化）与本模块（localStorage）。
// 请求层 / mock 层通过本模块读取 token，避免与 store 产生循环依赖。
// 之所以不直接读 pinia，是因为 axios 拦截器、mock 层这些「低层模块」被 store 依赖，
// 若再反过来 import store 就会形成循环依赖，这里用一个独立的纯函数模块充当「读 token」的公共出口。
const TOKEN_KEY = 'book-manage-token'

// 读取 token：取不到时返回空字符串（而非 null），让调用方无需判空即可直接比较。
export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}
