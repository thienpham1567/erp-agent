/**
 * Figma MCP Client
 *
 * Wraps Figma Desktop MCP Server (Streamable HTTP Transport)
 * Provides clean functions matching MCP tools.
 *
 * Usage:
 *   const client = new FigmaMCPClient();
 *   await client.connect();
 *   const ctx = await client.getDesignContext({ nodeId: "28489:1756" });
 *   const meta = await client.getMetadata({ nodeId: "28489:1756" });
 *   const img = await client.getScreenshot({ nodeId: "28489:1756" });
 */

// ─── Figma URL Parser ────────────────────────────────────────────────────────

/**
 * Parse a Figma URL to extract fileKey and nodeId
 * @param {string} url - Figma design URL
 * @returns {{ fileKey: string, nodeId: string } | null}
 */
export function parseFigmaUrl(url) {
  try {
    const u = new URL(url)
    const parts = u.pathname.split('/').filter(Boolean)

    let fileKey = null
    if (parts[0] === 'design' || parts[0] === 'file') {
      fileKey = parts[1]
      if (parts[2] === 'branch' && parts[3]) {
        fileKey = parts[3]
      }
    }

    let nodeId = null
    const nodeParam = u.searchParams.get('node-id')
    if (nodeParam) {
      nodeId = nodeParam.replace('-', ':')
    }

    return fileKey ? { fileKey, nodeId } : null
  } catch {
    return null
  }
}

// ─── MCP Transport Layer ─────────────────────────────────────────────────────

class MCPTransport {
  constructor(url) {
    this.url = url
    this.sessionId = null
    this.reqId = 0
  }

  async request(method, params = {}, isNotification = false) {
    const body = { jsonrpc: '2.0', method, params }
    if (!isNotification) {
      body.id = ++this.reqId
    }

    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    }
    if (this.sessionId) {
      headers['Mcp-Session-Id'] = this.sessionId
    }

    const res = await fetch(this.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    const sid = res.headers.get('mcp-session-id')
    if (sid) this.sessionId = sid

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`MCP ${method} failed: ${res.status} - ${text}`)
    }

    const ct = res.headers.get('content-type') || ''
    if (ct.includes('text/event-stream')) {
      return this._parseSSE(await res.text())
    }

    if (isNotification) return null
    return await res.json()
  }

  _parseSSE(text) {
    const events = text.split('\n\n').filter(Boolean)
    for (const event of events) {
      const lines = event.split('\n')
      let data = ''
      for (const line of lines) {
        if (line.startsWith('data: ')) data += line.slice(6)
      }
      if (data) {
        try {
          return JSON.parse(data)
        } catch {
          return { raw: data }
        }
      }
    }
    return null
  }

  async callTool(name, args) {
    return await this.request('tools/call', { name, arguments: args })
  }
}

// ─── Main Client Class ───────────────────────────────────────────────────────

export class FigmaMCPClient {
  /**
   * @param {Object} [options]
   * @param {string} [options.url] - MCP endpoint (default: http://127.0.0.1:3845/mcp)
   * @param {string} [options.assetsDir] - Set to enable asset download (default: null)
   * @param {string} [options.clientLanguages] - (default: "html,css,javascript")
   * @param {string} [options.clientFrameworks] - (default: "vanilla")
   * @param {string} [options.cacheDir] - Set to enable file caching (default: ".figma-cache")
   * @param {number} [options.cacheTTL] - Cache TTL in ms (default: 24h)
   * @param {string} [options.figmaToken] - Personal Access Token for REST API fallback (or env FIGMA_TOKEN)
   */
  constructor(options = {}) {
    this.url = options.url || 'http://127.0.0.1:3845/mcp'
    this.assetsDir = options.assetsDir || null
    this.cacheDir = options.cacheDir || '.figma-cache'
    this.cacheTTL = options.cacheTTL || 24 * 60 * 60 * 1000 // 24h default
    this.figmaToken = options.figmaToken || process.env.FIGMA_TOKEN || null
    this.clientLanguages = options.clientLanguages || 'html,css,javascript'
    this.clientFrameworks = options.clientFrameworks || 'vanilla'
    this.transport = new MCPTransport(this.url)
    this.connected = false
    this.serverInfo = null
  }

  // ─── Connection ──────────────────────────────────────────────────────

  async connect() {
    const result = await this.transport.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'figma-mcp-client', version: '1.0.0' },
    })

    if (!result?.result) {
      throw new Error('Failed to initialize MCP session')
    }

    this.serverInfo = result.result
    this.connected = true
    await this.transport.request('notifications/initialized', {}, true)
    return this.serverInfo
  }

  async _ensureConnected() {
    if (!this.connected) await this.connect()
  }

  // ─── File Cache ───────────────────────────────────────────────────

  _getCachePath(nodeId, type) {
    const { join } = require('path')
    const safeNode = (nodeId || 'unknown').replace(/:/g, '-')
    return join(this.cacheDir, `${safeNode}_${type}.json`)
  }

  _readCache(nodeId, type) {
    try {
      const { readFileSync, existsSync } = require('fs')
      const path = this._getCachePath(nodeId, type)
      if (!existsSync(path)) return null
      const raw = JSON.parse(readFileSync(path, 'utf-8'))
      if (Date.now() - raw._cachedAt > this.cacheTTL) return null
      return raw.data
    } catch {
      return null
    }
  }

  _writeCache(nodeId, type, data) {
    try {
      const { writeFileSync, mkdirSync, existsSync } = require('fs')
      if (!existsSync(this.cacheDir)) mkdirSync(this.cacheDir, { recursive: true })
      writeFileSync(this._getCachePath(nodeId, type), JSON.stringify({ _cachedAt: Date.now(), data }))
    } catch {
      /* silent */
    }
  }

  // ─── Figma REST API Fallback ─────────────────────────────────────────

  _isRateLimited(result, content) {
    return result?.result?.isError || content?.text?.includes('Rate limit')
  }

  /**
   * Fetch node data via Figma REST API (fallback when MCP is rate limited)
   * @param {string} fileKey
   * @param {string} nodeId
   * @returns {Promise<Object>} node data
   */
  async _restGetNode(fileKey, nodeId) {
    if (!this.figmaToken) return null
    console.log(`  🔄 Falling back to REST API for node ${nodeId}...`)
    const res = await fetch(`https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}&plugin_data=shared`, {
      headers: { 'X-Figma-Token': this.figmaToken },
    })
    if (!res.ok) {
      console.warn(`  ⚠️  REST API failed: ${res.status}`)
      return null
    }
    return await res.json()
  }

  /**
   * Get screenshot via Figma REST API (fallback)
   * @param {string} fileKey
   * @param {string} nodeId
   * @returns {Promise<{ buffer: Buffer, base64: string, mimeType: string } | null>}
   */
  async _restGetScreenshot(fileKey, nodeId) {
    if (!this.figmaToken) return null
    console.log(`  🔄 Falling back to REST API screenshot for ${nodeId}...`)
    const res = await fetch(`https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&format=png&scale=2`, {
      headers: { 'X-Figma-Token': this.figmaToken },
    })
    if (!res.ok) {
      console.warn(`  ⚠️  REST API screenshot failed: ${res.status}`)
      return null
    }
    const data = await res.json()
    const imageUrl = data?.images?.[nodeId]
    if (!imageUrl) return null

    const imgRes = await fetch(imageUrl)
    if (!imgRes.ok) return null
    const arrayBuf = await imgRes.arrayBuffer()
    const buffer = Buffer.from(arrayBuf)
    const base64 = buffer.toString('base64')
    return { buffer, base64, mimeType: 'image/png' }
  }

  /**
   * Convert Figma REST API node data to CSS-like design context
   */
  _nodeToDesignContext(nodeData) {
    if (!nodeData?.nodes) return null
    const entries = Object.values(nodeData.nodes)
    if (!entries.length || !entries[0]?.document) return null

    const node = entries[0].document
    const styles = entries[0].styles || {}
    const lines = []

    lines.push(`/* Node: ${node.name} (${node.type}) */`)
    if (node.absoluteBoundingBox) {
      const { width, height } = node.absoluteBoundingBox
      lines.push(`/* Size: ${width}×${height} */`)
    }

    // Extract fills
    if (node.fills?.length) {
      for (const fill of node.fills) {
        if (fill.type === 'SOLID' && fill.color) {
          const { r, g, b } = fill.color
          const a = fill.opacity ?? 1
          lines.push(`background-color: rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a});`)
        }
      }
    }

    // Extract strokes
    if (node.strokes?.length) {
      for (const stroke of node.strokes) {
        if (stroke.type === 'SOLID' && stroke.color) {
          const { r, g, b } = stroke.color
          lines.push(`border-color: rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, 1);`)
        }
      }
      if (node.strokeWeight) lines.push(`border-width: ${node.strokeWeight}px;`)
    }

    // Extract text styles
    if (node.type === 'TEXT' && node.style) {
      const s = node.style
      if (s.fontSize) lines.push(`font-size: ${s.fontSize}px;`)
      if (s.fontWeight) lines.push(`font-weight: ${s.fontWeight};`)
      if (s.lineHeightPx) lines.push(`line-height: ${s.lineHeightPx}px;`)
      if (s.letterSpacing) lines.push(`letter-spacing: ${s.letterSpacing}px;`)
    }

    // Extract children summary
    if (node.children?.length) {
      lines.push(`/* Children: ${node.children.length} */`)
      const childSummary = this._summarizeChildren(node.children, 1)
      lines.push(...childSummary)
    }

    // Style references
    if (Object.keys(styles).length) {
      lines.push(`\n/* Style references: */`)
      for (const [key, val] of Object.entries(styles)) {
        lines.push(`/* ${key}: ${val.name || val.key} */`)
      }
    }

    return lines.join('\n')
  }

  _summarizeChildren(children, depth = 0) {
    const lines = []
    const indent = '  '.repeat(depth)
    for (const child of children) {
      const size = child.absoluteBoundingBox ? ` (${child.absoluteBoundingBox.width}×${child.absoluteBoundingBox.height})` : ''
      const text = child.type === 'TEXT' && child.characters ? ` "${child.characters.slice(0, 50)}"` : ''
      lines.push(`${indent}/* ${child.type}: ${child.name}${size}${text} */`)
      if (child.children?.length && depth < 3) {
        lines.push(...this._summarizeChildren(child.children, depth + 1))
      }
    }
    return lines
  }

  // ─── Discovery ───────────────────────────────────────────────────────

  async listTools() {
    await this._ensureConnected()
    const result = await this.transport.request('tools/list')
    return result?.result?.tools || []
  }

  async listPrompts() {
    await this._ensureConnected()
    const result = await this.transport.request('prompts/list')
    return result?.result?.prompts || []
  }

  // ─── Helper ──────────────────────────────────────────────────────────

  _extractContent(result) {
    if (!result?.result?.content) return null
    const texts = []
    const images = []
    for (const c of result.result.content) {
      if (c.type === 'text') texts.push(c.text)
      else if (c.type === 'image') images.push(c)
    }
    return { text: texts.join('\n'), images }
  }

  _resolveParams(params) {
    let { nodeId, fileKey } = params
    if (params.url) {
      const parsed = parseFigmaUrl(params.url)
      if (parsed) {
        fileKey = fileKey || parsed.fileKey
        nodeId = nodeId || parsed.nodeId
      }
    }
    return { nodeId, fileKey }
  }

  // ─── Core MCP Tools ──────────────────────────────────────────────────

  /**
   * get_design_context — returns code + styles from Figma
   * Auto-retries with fileKey if Code Connect prompt is returned.
   *
   * @param {Object} params
   * @param {string} [params.nodeId]
   * @param {string} [params.fileKey]
   * @param {string} [params.url] - Figma URL (alternative)
   * @returns {Promise<{ text: string, images: Array, raw: Object }>}
   */
  async getDesignContext(params = {}) {
    await this._ensureConnected()
    let { nodeId, fileKey } = this._resolveParams(params)
    if (!nodeId) throw new Error('nodeId is required')

    // Check cache first
    const cached = this._readCache(nodeId, 'designContext')
    if (cached) {
      console.log(`  📦 Using cached designContext for ${nodeId}`)
      return cached
    }

    const args = {
      nodeId,
      clientLanguages: this.clientLanguages,
      clientFrameworks: this.clientFrameworks,
    }
    if (fileKey) args.fileKey = fileKey

    const result = await this.transport.callTool('get_design_context', args)
    const content = this._extractContent(result)

    if (!content) return { text: null, images: [], raw: result }

    // Fallback to REST API on rate limit
    if (this._isRateLimited(result, content)) {
      console.warn('  ⚠️  Rate limited on designContext, trying REST API fallback...')
      if (this.figmaToken && fileKey) {
        const nodeData = await this._restGetNode(fileKey, nodeId)
        const restText = this._nodeToDesignContext(nodeData)
        if (restText) {
          const output = { text: restText, images: [], raw: nodeData }
          const transformed = this.transformDesignContext(output)
          this._writeCache(nodeId, 'designContext', transformed)
          return transformed
        }
      }
      return { text: content.text, images: content.images, raw: result }
    }

    // Auto-skip Code Connect prompt
    const isPrompt = content.text.includes('missing code connect mappings') || content.text.includes('get_code_connect_suggestions')

    if (isPrompt && !fileKey) {
      const fkMatch = content.text.match(/fileKey:\s*(\w+)/)
      if (fkMatch) {
        return this.getDesignContext({ ...params, fileKey: fkMatch[1] })
      }
    }

    let text = content.text

    // Download assets if assetsDir is configured
    if (this.assetsDir) {
      const assetResult = await this.downloadAssets(text, this.assetsDir)
      text = assetResult.code
    }

    const output = { text, images: content.images, raw: result }
    const transformed = this.transformDesignContext(output)
    this._writeCache(nodeId, 'designContext', transformed)
    return transformed
  }

  /**
   * get_metadata — returns node structure as XML
   *
   * @param {Object} params
   * @param {string} [params.nodeId]
   * @param {string} [params.url]
   * @returns {Promise<{ text: string, raw: Object }>}
   */
  async getMetadata(params = {}) {
    await this._ensureConnected()
    const { nodeId } = this._resolveParams(params)

    // Check cache first
    const cached = this._readCache(nodeId, 'metadata')
    if (cached) {
      console.log(`  📦 Using cached metadata for ${nodeId}`)
      return cached
    }

    const result = await this.transport.callTool('get_metadata', {
      nodeId,
      clientLanguages: this.clientLanguages,
      clientFrameworks: this.clientFrameworks,
    })
    const content = this._extractContent(result)

    // Fallback to REST API on rate limit
    if (this._isRateLimited(result, content)) {
      console.warn('  ⚠️  Rate limited on metadata, trying REST API fallback...')
      const { fileKey } = this._resolveParams(params)
      if (this.figmaToken && fileKey) {
        const nodeData = await this._restGetNode(fileKey, nodeId)
        if (nodeData?.nodes) {
          const xml = JSON.stringify(nodeData.nodes, null, 2)
          const output = { text: xml, raw: nodeData }
          const transformed = this.transformMetadata(output)
          this._writeCache(nodeId, 'metadata', transformed)
          return transformed
        }
      }
      return { text: content?.text || null, raw: result }
    }

    const output = { text: content?.text || null, raw: result }
    const transformed = this.transformMetadata(output)
    this._writeCache(nodeId, 'metadata', transformed)
    return transformed
  }

  /**
   * get_screenshot — returns PNG screenshot
   *
   * @param {Object} params
   * @param {string} [params.nodeId]
   * @param {string} [params.url]
   * @returns {Promise<{ buffer: Buffer, base64: string, mimeType: string, raw: Object }>}
   */
  async getScreenshot(params = {}) {
    await this._ensureConnected()
    const { nodeId } = this._resolveParams(params)

    // Check cache first (screenshot cached as base64 + mimeType, no buffer)
    const cached = this._readCache(nodeId, 'screenshot')
    if (cached) {
      console.log(`  📦 Using cached screenshot for ${nodeId}`)
      return {
        buffer: Buffer.from(cached.base64, 'base64'),
        base64: cached.base64,
        mimeType: cached.mimeType,
        raw: cached.raw,
      }
    }

    const result = await this.transport.callTool('get_screenshot', { nodeId })
    const content = this._extractContent(result)

    // Fallback to REST API on rate limit
    if (this._isRateLimited(result, content)) {
      console.warn('  ⚠️  Rate limited on screenshot, trying REST API fallback...')
      const { fileKey } = this._resolveParams(params)
      if (this.figmaToken && fileKey) {
        const restImg = await this._restGetScreenshot(fileKey, nodeId)
        if (restImg) {
          this._writeCache(nodeId, 'screenshot', { base64: restImg.base64, mimeType: restImg.mimeType, raw: null })
          return { ...restImg, raw: null }
        }
      }
      return { buffer: null, base64: null, mimeType: null, raw: result }
    }

    if (!content?.images?.length) {
      return { buffer: null, base64: null, mimeType: null, raw: result }
    }

    const img = content.images[0]
    const output = {
      buffer: Buffer.from(img.data, 'base64'),
      base64: img.data,
      mimeType: img.mimeType,
      raw: result,
    }
    // Cache without buffer (not JSON-serializable)
    this._writeCache(nodeId, 'screenshot', { base64: img.data, mimeType: img.mimeType, raw: result })
    return output
  }

  /**
   * getFullDesign — calls all 3 tools in optimal order
   *
   * @param {Object} params
   * @param {string} [params.nodeId]
   * @param {string} [params.url]
   * @returns {Promise<{ screenshot, designContext, metadata }>}
   */
  async getFullDesign(params = {}) {
    await this._ensureConnected()
    const { nodeId, fileKey } = this._resolveParams(params)

    console.log(`🔍 Getting full design for node ${nodeId}...`)

    console.log('  📸 Getting screenshot...')
    const screenshot = await this.getScreenshot({ nodeId, fileKey })

    console.log('  🎨 Getting design context...')
    const designContext = await this.getDesignContext({ nodeId, fileKey })

    console.log('  📐 Getting metadata...')
    const metadata = await this.getMetadata({ nodeId, fileKey })

    console.log('  🔬 Getting pixel-accurate tree...')
    const pixelTree = await this.getPixelTree({ nodeId, fileKey })

    console.log('  ✅ Done!')

    return { screenshot, designContext, metadata, pixelTree, nodeId, fileKey }
  }

  // ─── Pixel-Accurate Tree Extraction ────────────────────────────────

  /**
   * getPixelTree — Fetches the full Figma node tree via REST API and walks
   * every child to extract pixel-accurate layout, style, and text data.
   * This is the primary source of truth for precise UI reproduction.
   *
   * Falls back gracefully:
   *  1. REST API with FIGMA_TOKEN
   *  2. Cached data from previous extraction
   *  3. Returns null if no token and no cache
   *
   * @param {Object} params
   * @param {string} [params.nodeId]
   * @param {string} [params.fileKey]
   * @param {string} [params.url] - Figma URL (alternative)
   * @returns {Promise<{ tree: string, raw: Object } | null>}
   */
  async getPixelTree(params = {}) {
    let { nodeId, fileKey } = this._resolveParams(params)

    // Check cache first
    const cached = this._readCache(nodeId, 'pixelTree')
    if (cached) {
      console.log(`  📦 Using cached pixelTree for ${nodeId}`)
      return cached
    }

    // Fetch full node tree via REST API (no depth limit)
    if (!this.figmaToken) {
      console.warn('  ⚠️  No FIGMA_TOKEN — cannot extract pixel tree. Set FIGMA_TOKEN env var.')
      return null
    }

    let nodeData = null
    try {
      const res = await fetch(`https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`, {
        headers: { 'X-Figma-Token': this.figmaToken },
      })
      if (res.status === 429) {
        console.warn('  ⚠️  REST API rate limited on pixelTree. Checking /tmp cache...')
        // Try /tmp cache from previous manual extraction
        try {
          const { readFileSync, existsSync } = require('fs')
          const tmpPath = '/tmp/figma_node.json'
          if (existsSync(tmpPath)) {
            console.log('  📦 Using /tmp/figma_node.json cache')
            nodeData = JSON.parse(readFileSync(tmpPath, 'utf-8'))
          }
        } catch {
          /* ignore */
        }
      } else if (res.ok) {
        nodeData = await res.json()
        // Also save to /tmp for future fallback
        try {
          const { writeFileSync } = require('fs')
          writeFileSync('/tmp/figma_node.json', JSON.stringify(nodeData))
        } catch {
          /* ignore */
        }
      } else {
        console.warn(`  ⚠️  REST API failed: ${res.status}`)
      }
    } catch (err) {
      console.warn(`  ⚠️  REST API error: ${err.message}`)
    }

    if (!nodeData?.nodes) return null

    const rootNode = Object.values(nodeData.nodes)[0]?.document
    if (!rootNode) return null

    const lines = []
    this._walkPixelTree(rootNode, 0, lines)
    const tree = lines.join('\n')

    const output = { tree, raw: nodeData }
    this._writeCache(nodeId, 'pixelTree', output)
    return output
  }

  /**
   * Recursively walks a Figma node tree and outputs a structured text
   * representation with all pixel-accurate properties.
   * @private
   */
  _walkPixelTree(node, depth, lines) {
    const indent = '  '.repeat(depth)
    const type = (node.type || '').substring(0, 4)
    const name = node.name || ''

    // Size
    let size = ''
    if (node.absoluteBoundingBox) {
      const { width, height } = node.absoluteBoundingBox
      size = ` [${Math.round(width)}x${Math.round(height)}]`
    }

    // Text content
    let chars = ''
    if (node.characters) chars = ` → "${node.characters}"`

    // Font style
    let font = ''
    if (node.style) {
      const s = node.style
      const parts = []
      if (s.fontFamily) parts.push(s.fontFamily)
      if (s.fontWeight) parts.push(s.fontWeight)
      if (s.fontSize) parts.push(`${s.fontSize}px`)
      if (parts.length) font = ` [${parts.join(' ')}]`
    }

    // Fill color
    let fill = ''
    if (node.fills?.length > 0 && node.fills[0].color) {
      const c = node.fills[0].color
      fill = ` [fill:rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${(c.a ?? 1).toFixed(2)})]`
    }

    // Stroke
    let stroke = ''
    if (node.strokes?.length > 0 && node.strokes[0].color) {
      const c = node.strokes[0].color
      stroke = ` [stroke:rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})]`
    }

    // Layout
    let layout = ''
    if (node.layoutMode) layout += ` ${node.layoutMode}`
    if (node.itemSpacing) layout += ` gap:${node.itemSpacing}`
    if (node.paddingLeft || node.paddingTop || node.paddingRight || node.paddingBottom) {
      layout += ` p:${node.paddingTop || 0}/${node.paddingRight || 0}/${node.paddingBottom || 0}/${node.paddingLeft || 0}`
    }

    // Corner radius
    let radius = ''
    if (node.cornerRadius) radius = ` r:${node.cornerRadius}`

    // Component properties (variants)
    let variants = ''
    if (node.componentProperties) {
      const props = Object.entries(node.componentProperties)
        .map(([k, v]) => `${k}=${v.value}`)
        .join(', ')
      if (props) variants = ` {${props}}`
    }

    lines.push(`${indent}${type}: ${name}${size}${chars}${font}${fill}${layout}${radius}${stroke}${variants}`)

    if (node.children) {
      for (const child of node.children) {
        this._walkPixelTree(child, depth + 1, lines)
      }
    }
  }

  // ─── Asset Download ──────────────────────────────────────────────────

  /**
   * Download SVG/PNG assets from localhost:3845 and replace URLs with local paths.
   * Called automatically when assetsDir is set. Can also be called manually.
   *
   * @param {string} code - design context text containing asset URLs
   * @param {string} assetsDir - directory to save downloaded assets
   * @returns {Promise<{ code: string, assets: Array<{ varName, url, localPath, filename }> }>}
   */
  async downloadAssets(code, assetsDir) {
    const { mkdirSync, existsSync, writeFileSync } = await import('fs')
    const { join } = await import('path')

    if (!existsSync(assetsDir)) mkdirSync(assetsDir, { recursive: true })

    const regex = /const\s+(\w+)\s*=\s*["'](http:\/\/localhost:\d+\/assets\/([a-f0-9]+)\.(\w+))["']/g
    let match
    let result = code
    const assets = []

    while ((match = regex.exec(code)) !== null) {
      const [, varName, url, , ext] = match
      const filename = `${varName}.${ext}`
      const localPath = join(assetsDir, filename)

      try {
        const res = await fetch(url)
        if (res.ok) {
          let data = Buffer.from(await res.arrayBuffer())

          // Fix SVG distortion: Figma exports with preserveAspectRatio="none"
          // and width/height="100%" which causes stretching outside Figma
          if (ext === 'svg') {
            let svgStr = data.toString('utf-8')
            svgStr = svgStr.replace(/preserveAspectRatio="none"/g, 'preserveAspectRatio="xMidYMid meet"')
            // Replace width="100%" height="100%" with viewBox dimensions
            const vb = svgStr.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)
            if (vb) {
              svgStr = svgStr.replace(/width="100%"/, `width="${vb[1]}"`)
              svgStr = svgStr.replace(/height="100%"/, `height="${vb[2]}"`)
            }
            data = Buffer.from(svgStr, 'utf-8')
          }

          writeFileSync(localPath, data)
          result = result.replaceAll(url, `./assets/${filename}`)
          assets.push({ varName, url, localPath, filename })
        }
      } catch (err) {
        console.warn(`⚠️  Failed to download ${url}: ${err.message}`)
      }
    }

    return { code: result, assets }
  }

  // ─── Transform: Figma CSS vars → Project Tailwind tokens ─────────────

  /** Map Figma MCP output to project design tokens */
  transformDesignContext(result) {
    if (!result.text) return result

    let t = result.text

    // ── 1. Font cleanup ──────────────────────────────────────────────
    // Remove Figma font-family (project uses Inter via tailwind-preset)
    t = t.replace(/\s*font-\[family-name:var\(--font-family[^\]]*\)\]/g, '')
    // font-[var(--font-weight/medium,normal)] → font-medium
    t = t.replace(/font-\[var\(--font-weight[\\\/]+(\w+),[^\]]*\)\]/g, (_m, w) => `font-${w}`)

    // ── 2. Text colors ───────────────────────────────────────────────
    t = t.replace(/text-\[color:var\(--([^\\\/]+)[\\\/]+text-icon[\\\/]+([^,)]+),[^\]]*\)\]/g, (_m, ns, v) => {
      v = v.trim()
      if (ns === 'neutral') {
        if (v === 'primary') return 'text-text-primary'
        if (v === 'secondary') return 'text-secondary'
        if (v === 'subtle' || v === 'tertiary') return 'text-subtle'
        if (v === 'quaternary') return 'text-quaternary'
        return `text-text-${v}`
      }
      if (ns === 'accent') {
        if (v === 'on-color') return 'text-white'
        if (v === 'accent') return 'text-brand'
        return `text-brand-${v}`
      }
      if (ns === 'danger') return 'text-destructive'
      if (ns === 'success' || ns === 'warning' || ns === 'info') return `text-${ns}`
      return `text-${ns}`
    })

    // ── 3. Background colors ─────────────────────────────────────────
    t = t.replace(/bg-\[var\(--([^\\\/]+)[\\\/]+surface[\\\/]+([^,)]+),[^\]]*\)\]/g, (_m, ns, v) => {
      v = v.trim()
      if (ns === 'neutral') {
        if (v === 'default') return 'bg-neutral'
        if (v === 'card' || v === 'container') return 'bg-table'
        return `bg-neutral-${v}`
      }
      if (ns === 'accent') {
        if (v === 'default' || v === 'bold') return 'bg-brand'
        if (v === 'light') return 'bg-brand-light'
        return `bg-brand-${v}`
      }
      if (ns === 'danger') return v === 'default' ? 'bg-destructive' : `bg-destructive-${v}`
      if (ns === 'success') return v === 'default' ? 'bg-success' : `bg-success-${v}`
      if (ns === 'warning') return v === 'default' ? 'bg-warning' : `bg-warning-${v}`
      if (ns === 'info') return v === 'default' ? 'bg-info' : `bg-info-${v}`
      return `bg-${ns}-${v}`
    })

    // ── 4. Border colors ─────────────────────────────────────────────
    t = t.replace(/border-\[var\(--([^\\\/]+)[\\\/]+border[\\\/]+([^,)]+),[^\]]*\)\]/g, (_m, ns, v) => {
      v = v.trim()
      if (ns === 'neutral') {
        if (v === 'secondary') return 'border-border-secondary'
        return 'border-card-border'
      }
      if (ns === 'accent') return 'border-brand-border'
      if (ns === 'danger') return 'border-destructive-border'
      return `border-${ns}-border`
    })

    // ── 5. Border radius ─────────────────────────────────────────────
    t = t.replace(/rounded-\[var\(--border-radius[\\\/]+(\w+),[^\]]*\)\]/g, (_m, size) => `rounded-${size}`)

    // ── 6. Font size ─────────────────────────────────────────────────
    t = t.replace(/text-\[length:var\(--font-size[\\\/]+(\w+),[^\]]*\)\]/g, (_m, size) => `text-${size}`)

    // ── 7. Line height ───────────────────────────────────────────────
    t = t.replace(/leading-\[var\(--line-height[\\\/]+(\w+),[^\]]*\)\]/g, (_m, size) => {
      const map = { xs: 'tight', sm: 'snug', md: 'normal', lg: 'relaxed', xl: 'loose' }
      return `leading-${map[size] || size}`
    })

    // ── 8. Spacing / sizing with px fallback ─────────────────────────
    t = t.replace(
      /(p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|space-x|space-y|w|h|min-w|min-h|max-w|max-h|size|inset|top|right|bottom|left)-\[var\(--(?:spacing|sizing)[\\\/]+[\w.]+,\s*(\d+(?:\.\d+)?)px\)\]/g,
      (_m, prop, px) => {
        const val = parseFloat(px)
        if (val % 4 === 0) return `${prop}-${val / 4}`
        if (val === 2) return `${prop}-0.5`
        if (val === 6) return `${prop}-1.5`
        if (val === 10) return `${prop}-2.5`
        if (val === 14) return `${prop}-3.5`
        return `${prop}-[${val}px]`
      }
    )

    // ── 9. Opacity ───────────────────────────────────────────────────
    t = t.replace(/opacity-\[var\(--opacity[\\\/]+(\w+),[^\]]*\)\]/g, (_m, v) => {
      const map = { disabled: 'opacity-50', hover: 'opacity-80', subtle: 'opacity-60' }
      return map[v] || `opacity-[var(--${v})]`
    })

    // ── 10. Hex fallback cleanup ─────────────────────────────────────
    const textHex = {
      '#101219': 'text-text-primary',
      '#171717': 'text-text-primary',
      '#737373': 'text-secondary',
      '#a3a3a3': 'text-subtle',
      '#525252': 'text-quaternary',
      '#ffffff': 'text-white',
      '#f20d0d': 'text-destructive',
      '#ef4444': 'text-destructive',
      '#22c55e': 'text-success',
      '#f59e0b': 'text-warning',
      '#3b82f6': 'text-info',
    }
    for (const [hex, token] of Object.entries(textHex)) {
      t = t.replace(new RegExp(`text-\\[${hex}\\]`, 'gi'), token)
      t = t.replace(new RegExp(`text-\\[color:${hex}\\]`, 'gi'), token)
    }

    const bgHex = {
      '#f5f5f5': 'bg-neutral',
      '#fafafa': 'bg-neutral-subtle',
      '#ffffff': 'bg-table',
    }
    for (const [hex, token] of Object.entries(bgHex)) {
      t = t.replace(new RegExp(`bg-\\[${hex}\\]`, 'gi'), token)
    }

    // ── 11. Shadow cleanup ───────────────────────────────────────────
    t = t.replace(/shadow-\[var\(--shadow[\\\/]+(\w+),[^\]]*\)\]/g, (_m, size) => `shadow-${size}`)

    // ── 12. Direct CSS var → Tailwind ────────────────────────────────
    const directMap = {
      table: 'bg-table',
      card: 'bg-card',
      sidebar: 'bg-sidebar',
      dialog: 'bg-dialog',
      overlay: 'bg-overlay',
      neutral: 'bg-neutral',
      'neutral-subtle': 'bg-neutral-subtle',
      'neutral-light': 'bg-neutral-light',
      brand: 'bg-brand',
      'brand-light': 'bg-brand-light',
      'input-background': 'bg-input-background',
    }
    for (const [cssVar, tw] of Object.entries(directMap)) {
      const escaped = cssVar.replace(/-/g, '\\-')
      t = t.replace(new RegExp(`bg-\\[var\\(--${escaped}[^\\]]*\\)\\]`, 'g'), tw)
    }

    // ── 13. Strip redundant text-text-primary on p/span/label ─────────
    // globals.css already sets color: var(--text-primary) on these tags
    t = t.replace(/(<(?:p|span|label)\b[^>]*)\s+text-text-primary/g, '$1')
    // Also handle className="text-text-primary ..." or "... text-text-primary"
    t = t.replace(/(<(?:p|span|label)\b[^>]*className="[^"]*)\btext-text-primary\b\s*/g, '$1')

    return { ...result, text: t }
  }

  /** Override to transform metadata output */
  transformMetadata(result) {
    return result
  }

  /** Override to extract design tokens */
  extractDesignTokens(code) {
    return {}
  }
}
