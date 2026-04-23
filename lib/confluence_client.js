/**
 * Confluence MCP Client
 *
 * Fetches Confluence page content via REST API and converts it to
 * clean Markdown for use by the figma-to-code skill as feature spec input.
 *
 * Authentication: Uses Atlassian API Token (Basic Auth).
 * Required env vars:
 *   CONFLUENCE_EMAIL    — Atlassian account email
 *   CONFLUENCE_API_TOKEN — API token from https://id.atlassian.com/manage-profile/security/api-tokens
 *
 * Usage:
 *   const client = new ConfluenceMCPClient();
 *   const spec = await client.getPageAsMarkdown("https://vietnixvn.atlassian.net/wiki/spaces/VEV/pages/141033474/...");
 *   const spec = await client.getPageAsMarkdown({ pageId: "141033474" });
 */

// ─── URL Parser ────────────────────────────────────────────────────────────

/**
 * Parse a Confluence URL to extract baseUrl, spaceKey, and pageId
 * Supports both new (/wiki/spaces/X/pages/ID) and legacy (/wiki/display/X/Title) formats
 *
 * @param {string} url - Confluence wiki page URL
 * @returns {{ baseUrl: string, spaceKey: string, pageId: string, title: string | null } | null}
 */
export function parseConfluenceUrl(url) {
  try {
    const u = new URL(url)
    const baseUrl = `${u.protocol}//${u.host}`
    const pathname = decodeURIComponent(u.pathname)

    // Format 1: /wiki/spaces/{SPACE}/pages/{PAGE_ID}/{Title}
    const newFormat = pathname.match(/\/wiki\/spaces\/([^/]+)\/pages\/(\d+)(?:\/(.+))?/)
    if (newFormat) {
      return {
        baseUrl,
        spaceKey: newFormat[1],
        pageId: newFormat[2],
        title: newFormat[3] ? decodeURIComponent(newFormat[3].replace(/\+/g, ' ')) : null,
      }
    }

    // Format 2: /wiki/display/{SPACE}/{Title}
    const legacyFormat = pathname.match(/\/wiki\/display\/([^/]+)\/(.+)/)
    if (legacyFormat) {
      return {
        baseUrl,
        spaceKey: legacyFormat[1],
        pageId: null, // Need to resolve via API
        title: decodeURIComponent(legacyFormat[2].replace(/\+/g, ' ')),
      }
    }

    return null
  } catch {
    return null
  }
}

// ─── HTML → Markdown Converter ────────────────────────────────────────────

/**
 * Lightweight Confluence Storage Format → Markdown converter.
 * Handles the most common Confluence macros and elements.
 * No external dependencies — pure regex/string transforms.
 */
function confluenceHtmlToMarkdown(html) {
  if (!html) return ''

  let md = html

  // ── 1. Remove Confluence macros wrapper ─────────────────────────────
  // Convert info/note/warning/tip/panel → plain blockquote (no emoji — LLM doesn't need them)
  md = md.replace(/<ac:structured-macro[^>]*ac:name="(info|note|warning|tip|panel)"[^>]*>([\s\S]*?)<\/ac:structured-macro>/g, (_m, _type, content) => {
    const body = content.replace(/<ac:rich-text-body>([\s\S]*?)<\/ac:rich-text-body>/g, '$1')
    return `\n> ${body.trim()}\n`
  })

  // ── 2. Remove remaining AC macros (code blocks, etc) ────────────────
  md = md.replace(/<ac:structured-macro[^>]*ac:name="code"[^>]*>([\s\S]*?)<\/ac:structured-macro>/g, (_m, content) => {
    const lang = content.match(/ac:parameter ac:name="language">([^<]+)/)
    const body = content.replace(/<ac:plain-text-body><!\[CDATA\[([\s\S]*?)\]\]><\/ac:plain-text-body>/g, '$1')
    return `\n\`\`\`${lang?.[1] || ''}\n${body.trim()}\n\`\`\`\n`
  })

  // ── 2b. Strip noise-only macros — zero content value for LLM ────────
  // TOC, expand wrappers, children, anchor, recently-updated, etc.
  md = md.replace(/<ac:structured-macro[^>]*ac:name="(toc|children|recently-updated|anchor|excerpt|jira|page-tree)"[^>]*>[\s\S]*?<\/ac:structured-macro>/g, '')
  md = md.replace(/<ac:structured-macro[^>]*ac:name="(toc|children|recently-updated|anchor|excerpt|jira|page-tree)"[^>]*\/>/g, '')

  // Expand macro → just extract inner content, drop the wrapper
  md = md.replace(/<ac:structured-macro[^>]*ac:name="expand"[^>]*>([\s\S]*?)<\/ac:structured-macro>/g, (_m, content) => {
    return content.replace(/<ac:rich-text-body>([\s\S]*?)<\/ac:rich-text-body>/g, '$1')
  })

  // Emoticons → remove (waste of tokens)
  md = md.replace(/<ac:emoticon[^>]*\/>/g, '')

  // Remove other AC tags
  md = md.replace(/<ac:[^>]*\/>/g, '')
  md = md.replace(/<\/?ac:[^>]*>/g, '')
  md = md.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')

  // ── 3. Confluence status macro → badge text ─────────────────────────
  md = md.replace(
    /<ac:structured-macro[^>]*ac:name="status"[^>]*>[\s\S]*?<ac:parameter ac:name="title">([^<]+)<\/ac:parameter>[\s\S]*?<\/ac:structured-macro>/g,
    '`[$1]`'
  )

  // ── 4. Headings ─────────────────────────────────────────────────────
  for (let i = 6; i >= 1; i--) {
    const re = new RegExp(`<h${i}[^>]*>([\\s\\S]*?)<\\/h${i}>`, 'g')
    md = md.replace(re, (_m, text) => `\n${'#'.repeat(i)} ${stripHtml(text).trim()}\n`)
  }

  // ── 5. Tables ───────────────────────────────────────────────────────
  md = md.replace(/<table[^>]*>([\s\S]*?)<\/table>/g, (_m, tableContent) => {
    const rows = []
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g
    let rowMatch
    let isFirstRow = true

    while ((rowMatch = rowRegex.exec(tableContent)) !== null) {
      const cells = []
      const cellRegex = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g
      let cellMatch
      while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
        cells.push(stripHtml(cellMatch[1]).trim().replace(/\|/g, '\\|').replace(/\n+/g, ' '))
      }

      if (cells.length > 0) {
        rows.push(`| ${cells.join(' | ')} |`)
        if (isFirstRow) {
          rows.push(`| ${cells.map(() => '---').join(' | ')} |`)
          isFirstRow = false
        }
      }
    }

    return rows.length > 0 ? `\n${rows.join('\n')}\n` : ''
  })

  // ── 6. Lists ────────────────────────────────────────────────────────
  md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/g, (_m, content) => {
    return '\n' + content.replace(/<li[^>]*>([\s\S]*?)<\/li>/g, (_m2, text) => `- ${stripHtml(text).trim()}\n`) + '\n'
  })
  md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/g, (_m, content) => {
    let idx = 0
    return '\n' + content.replace(/<li[^>]*>([\s\S]*?)<\/li>/g, (_m2, text) => `${++idx}. ${stripHtml(text).trim()}\n`) + '\n'
  })

  // ── 7. Inline formatting ────────────────────────────────────────────
  md = md.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/g, '**$1**')
  md = md.replace(/<b[^>]*>([\s\S]*?)<\/b>/g, '**$1**')
  md = md.replace(/<em[^>]*>([\s\S]*?)<\/em>/g, '*$1*')
  md = md.replace(/<i[^>]*>([\s\S]*?)<\/i>/g, '*$1*')
  md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/g, '`$1`')
  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, '[$2]($1)')

  // ── 8. Line breaks & paragraphs ─────────────────────────────────────
  md = md.replace(/<br\s*\/?>/g, '\n')
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/g, '\n$1\n')
  md = md.replace(/<div[^>]*>([\s\S]*?)<\/div>/g, '\n$1\n')

  // ── 9. Images (keep src) ────────────────────────────────────────────
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/g, '![$2]($1)')
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*\/?>/g, '![]($1)')

  // ── 10. Horizontal rule ─────────────────────────────────────────────
  md = md.replace(/<hr\s*\/?>/g, '\n---\n')

  // ── 11. Strip remaining HTML tags ───────────────────────────────────
  md = stripHtml(md)

  // ── 12. Decode HTML entities ──────────────────────────────────────────
  md = decodeHtmlEntities(md)

  // ── 13. LLM-optimized post-processing ────────────────────────────────

  // Remove images — LLM can't see them, waste of tokens
  md = md.replace(/!\[[^\]]*\]\([^)]*\)/g, '')

  // Remove empty bold/italic/code wrappers: ** **, * *, ` `
  md = md.replace(/\*\*\s*\*\*/g, '')
  md = md.replace(/\*\s*\*/g, '')
  md = md.replace(/`\s*`/g, '')

  // Remove decorative separators (---) — adds no meaning for LLM
  md = md.replace(/^\s*---\s*$/gm, '')

  // Remove empty list items
  md = md.replace(/^[-*]\s*$/gm, '')
  md = md.replace(/^\d+\.\s*$/gm, '')

  // Collapse multiple blank lines → single blank line
  md = md.replace(/\n{3,}/g, '\n\n')

  // Remove leading/trailing whitespace on each line
  md = md
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')

  return md.trim()
}

/** Strip all HTML tags from a string */
function stripHtml(html) {
  return html.replace(/<[^>]*>/g, '')
}

// Named HTML entity map — covers the entities Confluence emits (symbols +
// Vietnamese diacritics). Numeric/hex entities handled separately below.
const NAMED_ENTITIES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  rarr: '→', larr: '←', mdash: '—', ndash: '–', hellip: '…',
  copy: '©', reg: '®', trade: '™', deg: '°', times: '×', divide: '÷',
  agrave: 'à', aacute: 'á', atilde: 'ã', acirc: 'â', auml: 'ä', aring: 'å',
  egrave: 'è', eacute: 'é', ecirc: 'ê', euml: 'ë',
  igrave: 'ì', iacute: 'í', icirc: 'î', iuml: 'ï',
  ograve: 'ò', oacute: 'ó', otilde: 'õ', ocirc: 'ô', ouml: 'ö',
  ugrave: 'ù', uacute: 'ú', ucirc: 'û', uuml: 'ü',
  yacute: 'ý', yuml: 'ÿ', ntilde: 'ñ', ccedil: 'ç',
  Agrave: 'À', Aacute: 'Á', Atilde: 'Ã', Acirc: 'Â', Auml: 'Ä', Aring: 'Å',
  Egrave: 'È', Eacute: 'É', Ecirc: 'Ê', Euml: 'Ë',
  Igrave: 'Ì', Iacute: 'Í', Icirc: 'Î', Iuml: 'Ï',
  Ograve: 'Ò', Oacute: 'Ó', Otilde: 'Õ', Ocirc: 'Ô', Ouml: 'Ö',
  Ugrave: 'Ù', Uacute: 'Ú', Ucirc: 'Û', Uuml: 'Ü',
  Yacute: 'Ý', Ntilde: 'Ñ', Ccedil: 'Ç',
}

function decodeHtmlEntities(str) {
  return str.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    return NAMED_ENTITIES[body] ?? match
  })
}

/**
 * Minimal p-limit equivalent — returns a function that caps concurrent promises.
 * Preserves call order for resolution (tasks start in order, results map to input order).
 *
 * @param {number} concurrency
 * @returns {<T>(fn: () => Promise<T>) => Promise<T>}
 */
function pLimit(concurrency) {
  const queue = []
  let active = 0

  const next = () => {
    active--
    if (queue.length > 0) queue.shift()()
  }

  return (fn) =>
    new Promise((resolve, reject) => {
      const run = () => {
        active++
        fn().then(resolve, reject).finally(next)
      }
      if (active < concurrency) run()
      else queue.push(run)
    })
}

// ─── Main Client Class ───────────────────────────────────────────────────

export class ConfluenceMCPClient {
  /**
   * @param {Object} [options]
   * @param {string} [options.email]    — Atlassian account email (or CONFLUENCE_EMAIL env)
   * @param {string} [options.apiToken] — API token (or CONFLUENCE_API_TOKEN env)
   * @param {string} [options.baseUrl]  — Confluence instance URL (auto-detected from page URL)
   */
  constructor(options = {}) {
    this.email = options.email || process.env.CONFLUENCE_EMAIL || ''
    this.apiToken = options.apiToken || process.env.CONFLUENCE_API_TOKEN || ''
    this.baseUrl = options.baseUrl || ''
  }

  /**
   * Build Basic Auth header
   * @returns {Record<string, string>}
   */
  _getHeaders() {
    if (!this.email || !this.apiToken) {
      throw new Error(
        'Missing Confluence credentials. Set CONFLUENCE_EMAIL and CONFLUENCE_API_TOKEN env vars, ' +
          'or pass { email, apiToken } to constructor.\n' +
          'Generate a token at: https://id.atlassian.com/manage-profile/security/api-tokens'
      )
    }

    const auth = Buffer.from(`${this.email}:${this.apiToken}`).toString('base64')
    return {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
    }
  }

  /**
   * Fetch Confluence REST API
   * @param {string} url
   * @returns {Promise<any>}
   */
  async _fetch(url) {
    const res = await fetch(url, { headers: this._getHeaders() })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Confluence API error: ${res.status} ${res.statusText} - ${text.slice(0, 200)}`)
    }

    return res.json()
  }

  /**
   * Get page content by ID using v2 API
   * @param {string} baseUrl - Confluence instance URL
   * @param {string} pageId  - Page ID
   * @returns {Promise<{ title: string, body: string, version: number, spaceKey: string }>}
   */
  async _getPageById(baseUrl, pageId) {
    const url = `${baseUrl}/wiki/api/v2/pages/${pageId}?body-format=storage`
    const data = await this._fetch(url)

    return {
      title: data.title,
      body: data.body?.storage?.value || '',
      version: data.version?.number,
      spaceKey: data.spaceId,
      pageId: data.id,
      _links: data._links,
    }
  }

  /**
   * Resolve page ID from title + space key (for legacy URLs)
   * @param {string} baseUrl
   * @param {string} spaceKey
   * @param {string} title
   * @returns {Promise<string>}
   */
  async _resolvePageId(baseUrl, spaceKey, title) {
    const cql = encodeURIComponent(`space="${spaceKey}" AND title="${title}"`)
    const url = `${baseUrl}/wiki/rest/api/content/search?cql=${cql}&limit=1`
    const data = await this._fetch(url)

    if (!data.results?.length) {
      throw new Error(`Page not found: "${title}" in space "${spaceKey}"`)
    }

    return data.results[0].id
  }

  /**
   * Get child pages of a given page
   * @param {string} baseUrl
   * @param {string} pageId
   * @returns {Promise<Array<{ id: string, title: string }>>}
   */
  async getChildPages(baseUrl, pageId) {
    const url = `${baseUrl}/wiki/api/v2/pages/${pageId}/children?limit=50`
    const data = await this._fetch(url)
    return (data.results || []).map((p) => ({ id: p.id, title: p.title }))
  }

  /**
   * Extract the "Acceptance criteria" section from raw Confluence storage HTML.
   *
   * Strategy: Find a heading (h1-h6) containing "acceptance criteria" (case-insensitive),
   * then grab everything from that heading until the next heading of the same or higher level.
   *
   * @param {string} html - Raw Confluence storage format HTML
   * @returns {string|null} - The extracted HTML section, or null if not found
   */
  _extractAcceptanceCriteriaHtml(html) {
    if (!html) return null

    // Match heading tags containing "Acceptance criteria" (case-insensitive, may have inner tags)
    const headingRegex = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi
    let match
    let startIndex = -1
    let headingLevel = 0

    while ((match = headingRegex.exec(html)) !== null) {
      const headingText = stripHtml(match[2]).trim()
      if (/acceptance\s*criteria/i.test(headingText)) {
        startIndex = match.index + match[0].length
        headingLevel = parseInt(match[1], 10)
        break
      }
    }

    if (startIndex === -1) return null

    // Find the next heading of the same or higher level (lower number = higher level)
    const nextHeadingRegex = new RegExp(`<h([1-${headingLevel}])[^>]*>`, 'gi')
    nextHeadingRegex.lastIndex = startIndex

    const nextMatch = nextHeadingRegex.exec(html)
    const endIndex = nextMatch ? nextMatch.index : html.length

    return html.slice(startIndex, endIndex).trim()
  }

  // ─── Public API ──────────────────────────────────────────────────────

  /**
   * Fetch a Confluence page and return only the "Acceptance criteria" section as Markdown.
   *
   * @param {string | { pageId?: string, url?: string, spaceKey?: string, title?: string }} input
   *   - A Confluence URL string, OR
   *   - An object with { pageId } or { spaceKey, title }
   *
   * @returns {Promise<{ markdown: string, title: string, pageId: string, url: string }>}
   *
   * @example
   *   // By URL
   *   const spec = await client.getPageAsMarkdown("https://vietnixvn.atlassian.net/wiki/spaces/VEV/pages/141033474/...");
   *
   *   // By page ID
   *   const spec = await client.getPageAsMarkdown({ pageId: "141033474" });
   */
  async getPageAsMarkdown(input) {
    let baseUrl, pageId, spaceKey, title

    if (typeof input === 'string') {
      const parsed = parseConfluenceUrl(input)
      if (!parsed) throw new Error(`Invalid Confluence URL: ${input}`)
      baseUrl = parsed.baseUrl
      pageId = parsed.pageId
      spaceKey = parsed.spaceKey
      title = parsed.title
    } else {
      baseUrl = input.baseUrl || this.baseUrl
      pageId = input.pageId
      spaceKey = input.spaceKey
      title = input.title
    }

    if (!baseUrl) throw new Error('baseUrl is required — pass a URL or set options.baseUrl')

    // Resolve page ID from title if needed
    if (!pageId && spaceKey && title) {
      pageId = await this._resolvePageId(baseUrl, spaceKey, title)
    }

    if (!pageId) throw new Error('Could not determine pageId from input')

    // Fetch page content
    const page = await this._getPageById(baseUrl, pageId)

    // Extract only "Acceptance criteria" section, fall back to full page
    const acHtml = this._extractAcceptanceCriteriaHtml(page.body)
    const markdown = confluenceHtmlToMarkdown(acHtml || page.body)

    // Build canonical URL
    const pageUrl = `${baseUrl}/wiki/spaces/${spaceKey || page.spaceKey}/pages/${pageId}`

    return {
      markdown,
      title: page.title,
      pageId: String(pageId),
      url: pageUrl,
      acceptanceCriteriaOnly: !!acHtml,
    }
  }

  /**
   * Fetch multiple Confluence pages and merge into a single Markdown document.
   * Fetches run in parallel (capped at `concurrency`, default 5 — well under
   * Atlassian's 500-req/5-min limit); output order matches input order.
   *
   * @param {string[]} urls - Array of Confluence page URLs
   * @param {{ concurrency?: number }} [options]
   * @returns {Promise<{ markdown: string, pages: Array<{ title: string, pageId: string }> }>}
   */
  async getMultiplePagesAsMarkdown(urls, options = {}) {
    const limit = pLimit(options.concurrency ?? 5)
    const results = await Promise.all(urls.map((url) => limit(() => this.getPageAsMarkdown(url))))

    const pages = results.map((r) => ({ title: r.title, pageId: r.pageId, url: r.url }))
    const sections = results.map((r) => `# ${r.title}\n\n> Source: ${r.url}\n\n${r.markdown}`)

    return {
      markdown: sections.join('\n\n---\n\n'),
      pages,
    }
  }
}
