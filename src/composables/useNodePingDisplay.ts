import type { MaybeRefOrGetter } from 'vue'
import type { NodePingHistoryPoint, NodePingPerTaskStat } from '@/composables/useNodePingStats'
import { computed, toValue } from 'vue'
import { NODE_PING_BAR_COUNT, useNodePingStats } from '@/composables/useNodePingStats'
import { useAppStore } from '@/stores/app'
import { formatDateTime } from '@/utils/helper'
import { groupPingTasksByStack, pingStackLabel } from '@/utils/pingStack'

export type NodePingMetric = 'latency' | 'loss'

// getRecords 在新版主控中返回的是近期可用样本，不保证覆盖完整 1 小时。
const RECENT_PING_RECORDS_QUERY_HOURS = 1

const MS_SUFFIX_RE = /ms$/

// 三网延迟固定展示的记录数量
const PING_NETWORK_DISPLAY_COUNT = 3

export interface NodePingBar {
  key: string
  className: string
  tooltip: string
}

export interface NodePingStackRow {
  stack: 'v4' | 'v6'
  value: string
  bars: NodePingBar[]
}

export interface NodePingStackPanel {
  tooltip: string
  rows: NodePingStackRow[]
}

export interface NodePingNetworkStackCell {
  key: string
  /** 不带单位的数值，缺失时为 -- */
  latency: string
  toneClass: string
  tooltip: string
}

export interface NodePingNetworkStackRow {
  stack: 'v4' | 'v6'
  cells: NodePingNetworkStackCell[]
}

interface NodePingNetworkEntry {
  key: string
  latency: string
  toneClass: string
}

interface NodePingNetworkDisplay {
  name: string
  /** 同一线路的各协议栈（v4 在前、v6 在后）；单栈任务只有一项 */
  entries: NodePingNetworkEntry[]
  tooltip: string
}

interface UseNodePingDisplayOptions {
  enabled?: MaybeRefOrGetter<boolean>
  loadingDisplayText?: string
  emptyDisplayText?: string
  loadingPanelTooltipText?: Partial<Record<NodePingMetric, string>>
  emptyPanelTooltipText?: Partial<Record<NodePingMetric, string>>
}

export function getPingToneClass(value: number): string {
  if (!value)
    return 'text-muted-foreground'
  if (value <= 60)
    return 'text-emerald-600 dark:text-emerald-400'
  if (value <= 120)
    return 'text-green-600 dark:text-green-400'
  if (value <= 180)
    return 'text-lime-600 dark:text-lime-400'
  if (value <= 240)
    return 'text-amber-600 dark:text-amber-400'
  return 'text-rose-600 dark:text-rose-400'
}

function getLatencyToneClass(latency: number): string {
  if (latency <= 60)
    return 'bg-emerald-600/90'
  if (latency <= 120)
    return 'bg-green-500/80'
  if (latency <= 180)
    return 'bg-lime-400/80'
  if (latency <= 240)
    return 'bg-yellow-400/80'
  return 'bg-rose-500/80'
}

function getLossToneClass(loss: number): string {
  if (loss <= 1)
    return 'bg-emerald-600/90'
  if (loss <= 3)
    return 'bg-green-500/80'
  if (loss <= 6)
    return 'bg-lime-400/80'
  if (loss <= 9)
    return 'bg-yellow-400/80'
  return 'bg-rose-500/80'
}

function formatTaskLatency(stat: NodePingPerTaskStat): { latency: string, toneClass: string } {
  return {
    latency: stat.avgLatency >= 0 ? `${Math.round(stat.avgLatency)}ms` : '--',
    toneClass: stat.avgLatency >= 0 ? getPingToneClass(stat.avgLatency) : 'text-rose-500',
  }
}

function toNetworkDisplay(group: { base: string, items: Array<{ stack: 'v4' | 'v6' | null, item: NodePingPerTaskStat }> }): NodePingNetworkDisplay {
  // 多栈时只在最后一个值后带单位：35/38ms
  const entries = group.items.map(({ item }, index) => {
    const formatted = formatTaskLatency(item)
    const latency = index < group.items.length - 1 ? formatted.latency.replace(MS_SUFFIX_RE, '') : formatted.latency
    return { key: String(item.taskId), latency, toneClass: formatted.toneClass }
  })
  const lines = group.items.length > 1
    ? group.items.map(({ stack, item }) => `${pingStackLabel(stack) || item.name} ${formatTaskLatency(item).latency}`)
    : [entries[0]?.latency ?? '--']
  return {
    name: group.base,
    entries,
    tooltip: [group.base, ...lines].join('\n'),
  }
}

export function useNodePingDisplay(
  uuid: MaybeRefOrGetter<string>,
  options: UseNodePingDisplayOptions = {},
) {
  const appStore = useAppStore()
  // Komari 1.2.6+ uses metric-store retention and keeps the legacy public
  // record fields for compatibility only. They can report records as disabled
  // even when ping metrics are available, so only an explicit caller option
  // should prevent the query.
  const pingStatsEnabled = computed(() => options.enabled === undefined || toValue(options.enabled))

  const pingRecordsQueryHours = computed(() => RECENT_PING_RECORDS_QUERY_HOURS)

  const pingStats = useNodePingStats(uuid, {
    hours: pingRecordsQueryHours,
    enabled: pingStatsEnabled,
  })

  function buildPingBars(metric: NodePingMetric, points: NodePingHistoryPoint[] = pingStats.history.value, label = ''): NodePingBar[] {
    if (!points.length)
      return []

    const prefix = label ? `${label} ` : ''
    return points.map((point, index) => {
      const value = point[metric]

      return {
        key: `${label}${point.time}-${index}`,
        className: value === null
          ? 'bg-muted-foreground/15'
          : metric === 'latency'
            ? getLatencyToneClass(value)
            : getLossToneClass(value),
        tooltip: value === null
          ? `${prefix}${formatDateTime(point.time, 'HH:mm:ss')} N/A`
          : metric === 'latency'
            ? `${prefix}${formatDateTime(point.time, 'HH:mm:ss')}\n${Math.round(value)} ms`
            : `${prefix}${formatDateTime(point.time, 'HH:mm:ss')}\n${value.toFixed(1)}%`,
      }
    })
  }

  function buildEmptyPingBars(metric: NodePingMetric): NodePingBar[] {
    const tooltip = pingStats.loading.value
      ? '加载中'
      : pingStats.error.value
        ? '加载失败'
        : !pingStatsEnabled.value
            ? '未启用记录'
            : metric === 'latency'
              ? 'N/A'
              : 'N/A'

    return Array.from({ length: NODE_PING_BAR_COUNT }, (_, index) => ({
      key: `${metric}-empty-${index}`,
      className: 'bg-muted-foreground/10',
      tooltip,
    }))
  }

  const latencyBars = computed(() => buildPingBars('latency'))
  const lossBars = computed(() => buildPingBars('loss'))
  const latencyRenderBars = computed(() => latencyBars.value.length ? latencyBars.value : buildEmptyPingBars('latency'))
  const lossRenderBars = computed(() => lossBars.value.length ? lossBars.value : buildEmptyPingBars('loss'))

  // 双栈节点：延迟 / 丢包面板拆成 IPv4、IPv6 两行
  function buildStackPanel(metric: NodePingMetric): NodePingStackPanel | null {
    const byStack = pingStats.stats.value.byStack
    if (!byStack)
      return null
    const stacks = ['v4', 'v6'] as const
    const format = (stack: 'v4' | 'v6') => metric === 'latency'
      ? `${Math.round(byStack[stack].avgLatency)}`
      : byStack[stack].avgLoss.toFixed(1)
    const unit = metric === 'latency' ? 'ms' : '%'
    const title = metric === 'latency' ? '平均延迟' : '平均丢包'
    return {
      tooltip: stacks.map(stack => `${pingStackLabel(stack)} ${title} ${format(stack)}${unit}`).join('\n'),
      rows: stacks.map(stack => ({
        stack,
        value: `${format(stack)}${unit}`,
        bars: buildPingBars(metric, byStack[stack].history, pingStackLabel(stack)),
      })),
    }
  }

  const latencyStackPanel = computed(() => buildStackPanel('latency'))
  const lossStackPanel = computed(() => buildStackPanel('loss'))

  const latencyDisplay = computed(() => {
    if (pingStats.hasData.value)
      return `${Math.round(pingStats.avgLatency.value)} ms`
    if (pingStats.loading.value)
      return options.loadingDisplayText ?? '加载中'
    return options.emptyDisplayText ?? '-'
  })

  const lossDisplay = computed(() => {
    if (pingStats.hasData.value)
      return `${pingStats.avgLoss.value.toFixed(1)}%`
    if (pingStats.loading.value)
      return options.loadingDisplayText ?? '加载中'
    return options.emptyDisplayText ?? '-'
  })

  const latencyPanelTooltip = computed(() => {
    if (!pingStats.hasData.value) {
      if (pingStats.loading.value)
        return options.loadingPanelTooltipText?.latency ?? ''
      return options.emptyPanelTooltipText?.latency ?? ''
    }
    return `平均延迟 ${Math.round(pingStats.avgLatency.value)} ms`
  })

  const lossPanelTooltip = computed(() => {
    if (!pingStats.hasData.value) {
      if (pingStats.loading.value)
        return options.loadingPanelTooltipText?.loss ?? ''
      return options.emptyPanelTooltipText?.loss ?? ''
    }

    const volatility = pingStats.avgVolatility.value > 0
      ? `，平均波动 ${pingStats.avgVolatility.value.toFixed(2)}`
      : ''
    return `平均丢包 ${pingStats.avgLoss.value.toFixed(1)}%${volatility}`
  })

  const topPingGroups = computed(() => {
    // 先按双栈后缀把同一线路的 v4 / v6 合成一组，再按组取前 3 条
    const groups = groupPingTasksByStack(pingStats.perTaskStats.value, stat => stat.name)
    const configuredNames = appStore.pingNetworkOrder

    // 未配置自定义顺序时保持默认行为：按后台顺序取前 3 组
    if (!configuredNames.length)
      return groups.slice(0, PING_NETWORK_DISPLAY_COUNT)

    const selected: typeof groups = []
    const used = new Set<(typeof groups)[number]>()

    // 按配置顺序匹配：既可以写分组名（四川电信），也可以写完整任务名（四川电信 v4）
    for (const name of configuredNames) {
      if (selected.length >= PING_NETWORK_DISPLAY_COUNT)
        break
      const group = groups.find(g => !used.has(g) && (g.base === name || g.items.some(({ item }) => item.name === name)))
      if (group) {
        selected.push(group)
        used.add(group)
      }
    }

    // 不足 3 组时用剩余分组按后台顺序补位
    for (const group of groups) {
      if (selected.length >= PING_NETWORK_DISPLAY_COUNT)
        break
      if (!used.has(group)) {
        selected.push(group)
        used.add(group)
      }
    }

    return selected
  })

  const topPingNetworks = computed(() => topPingGroups.value.map(toNetworkDisplay))

  // 表头：去掉各线路名的公共前缀（四川电信 / 四川联通 → 电信 / 联通）
  const pingNetworkHeaders = computed(() => {
    const names = topPingGroups.value.map(group => group.base)
    if (names.length < 2)
      return names
    let prefix = 0
    while (names.every(name => name.length > prefix + 1 && name[prefix] === names[0]![prefix]))
      prefix += 1
    return names.map(name => name.slice(prefix).trim() || name)
  })

  // 有双栈线路时，三网改成 v4 / v6 两行、按线路对齐成列
  const pingNetworkStackRows = computed<NodePingNetworkStackRow[] | null>(() => {
    const groups = topPingGroups.value
    if (!groups.some(group => group.items.some(({ stack }) => stack === 'v6')))
      return null
    return (['v4', 'v6'] as const).map(stack => ({
      stack,
      cells: groups.map((group) => {
        // 无后缀任务视为 v4
        const found = group.items.find(entry => (entry.stack ?? 'v4') === stack)
        if (!found)
          return { key: `${group.base}-${stack}`, latency: '--', toneClass: 'text-muted-foreground/60', tooltip: `${group.base} ${pingStackLabel(stack)} 无数据` }
        const formatted = formatTaskLatency(found.item)
        return {
          key: String(found.item.taskId),
          latency: formatted.latency.replace(MS_SUFFIX_RE, ''),
          toneClass: formatted.toneClass,
          tooltip: `${group.base} ${pingStackLabel(stack)} ${formatted.latency}`,
        }
      }),
    }))
  })

  return {
    pingStats,
    pingStatsEnabled,
    pingRecordsQueryHours,
    latencyRenderBars,
    lossRenderBars,
    latencyDisplay,
    lossDisplay,
    latencyPanelTooltip,
    lossPanelTooltip,
    latencyStackPanel,
    lossStackPanel,
    perTaskStats: pingStats.perTaskStats,
    topPingNetworks,
    pingNetworkStackRows,
    pingNetworkHeaders,
  }
}
