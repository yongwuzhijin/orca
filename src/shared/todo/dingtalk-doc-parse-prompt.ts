import { joinRequirementPrdPath } from './todo-requirement-worktree-paths'

export const DINGTALK_DOC_MCP_INSTALL_URL =
  'https://aihub.dingtalk.com/#/detail?instanceId=653287&detailType=instanceMcpDetail&mcpId=9629'

const DINGTALK_DOC_MCP_HINTS = ['ding_doc', 'dingtalk', 'dmon-work', 'alidocs'] as const

export function buildDingTalkDocParsePrompt(worktreePath: string): string {
  const filePath = joinRequirementPrdPath(worktreePath)
  const docDir = filePath.replace(/\\/g, '/').replace(/\/[^/]+$/, '')
  const assetsDir = `${docDir}/assets`

  return [
    '请解析以下原始 PRD 文件中包含的钉钉文档链接（域名为 alidocs.dingtalk.com）：',
    `路径：${filePath}`,
    '',
    '处理要求：',
    '1. 通过 MCP Server 工具读取每个钉钉链接对应的文档正文（如果有多条，按出现顺序逐一获取）。',
    '2. 用读取到的钉钉文档正文，覆盖写回上述文件（直接 overwrite）。',
    '3. 若同一文件中含其他非钉钉文本，请保留其语义并把钉钉文档正文合并进来。',
    '4. 图片本地化（必须在 OSS 签名过期前立即执行）：',
    '   - 找出正文中所有 alidocs2.oss-cn-zhangjiakou.aliyuncs.com 的图片 URL',
    `   - 逐一下载到 ${assetsDir}/（文件名必须保留 .png/.jpg 等扩展名）`,
    '   - 把 Markdown / HTML 里的远程图片 URL 替换为下载后的本地绝对路径',
    '   - 若某张图下载失败，保留原 URL 并在汇报中说明',
    '5. 完成后简要汇报：解析到了几条链接、文件已覆盖的字节数、成功下载几张图片。',
    '',
    '注意：钉钉文档正文必须经 MCP 工具读取，不要走普通 HTTP fetch。',
    '注意：OSS 图片 URL 带 Expires 签名，几小时后会 403，务必在写入 Markdown 后立刻下载到 assets/。',
    `若用户未安装钉钉文档 MCP，提示访问 ${DINGTALK_DOC_MCP_INSTALL_URL} 安装。`
  ].join('\n')
}

export function isLikelyDingTalkDocMcpServer(args: {
  name: string
  command?: string
  url?: string
}): boolean {
  const haystack = `${args.name} ${args.command ?? ''} ${args.url ?? ''}`.toLowerCase()
  return DINGTALK_DOC_MCP_HINTS.some((hint) => haystack.includes(hint))
}
