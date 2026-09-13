// ============ CSV 导出工具（HTML5 Blob 实现） ============
// 原理：把数据拼接成符合 CSV 规范的文本，再包装成 Blob，借助 <a download> 触发浏览器下载，
// 全程不依赖任何第三方库，也不需要后端参与。
// CSV 本质上就是「用逗号分隔字段、用换行分隔行」的纯文本，注意点在于：
//   - 字段里若含逗号/引号/换行，必须按 RFC 规则加引号并转义，否则 Excel 会错列；
//   - 文本前加 BOM（字节序标记），让 Excel 识别为 UTF-8，避免中文乱码。
// CSV 导出工具（HTML5 Blob 实现）

/** 列配置 */
export interface CsvColumn<T> {
  title: string
  /** 取值：字段名 或 自定义取值函数 */
  key: keyof T | ((row: T) => string | number)
}

/** CSV 字段转义（处理逗号、引号、换行） */
// 若字段包含逗号、引号或换行，就必须用一对双引号包裹整个字段，
// 并且把字段内的双引号加倍（" -> ""），否则解析器会把逗号当成列分隔、把换行当成行分隔。
function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"'
  }
  return value
}

/**
 * 导出 CSV 文件
 * @param filename 文件名（不含扩展名）
 * @param columns 列定义
 * @param rows 数据行
 */
export function exportCsv<T>(filename: string, columns: CsvColumn<T>[], rows: T[]): void {
  const header = columns.map((col) => escapeCsv(col.title)).join(',')
  const body = rows
    .map((row) =>
      columns
        .map((col) => {
          const value = typeof col.key === 'function' ? col.key(row) : (row[col.key] as string | number)
          return escapeCsv(String(value ?? ''))
        })
        .join(','),
    )
    .join('\n')

  // 带 BOM，保证 Excel 打开中文不乱码
  const blob = new Blob(['﻿' + header + '\n' + body], { type: 'text/csv;charset=utf-8;' })
  // 生成一个指向 Blob 的临时 URL，再挂到一个临时的 <a download> 标签上程序化点击触发下载；
  // 下载完移除节点并 revokeObjectURL 释放内存，避免内存泄漏。
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${filename}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
