<script setup lang="ts">
import { DataTooltip } from '@/components/ui/data-tooltip'
import { useNodePingDisplay } from '@/composables/useNodePingDisplay'

const props = defineProps<{
  uuid: string
  online: boolean
}>()

const {
  latencyRenderBars,
  lossRenderBars,
  topPingNetworks,
  pingNetworkStackRows,
} = useNodePingDisplay(() => props.uuid)
</script>

<template>
  <div class="flex flex-col">
    <div
      v-if="pingNetworkStackRows"
      class="grid w-max items-center gap-x-2 text-[10px] leading-tight tabular-nums"
      :style="{ gridTemplateColumns: `auto repeat(${pingNetworkStackRows[0]!.cells.length}, auto)` }"
    >
      <template v-for="row in pingNetworkStackRows" :key="row.stack">
        <span class="text-[9px] text-muted-foreground/70">{{ row.stack }}</span>
        <DataTooltip
          v-for="cell in row.cells" :key="cell.key" placement="top" :content="cell.tooltip"
          content-class="whitespace-pre-wrap w-max px-1.5 !leading-[1.2] text-[11px]"
        >
          <span class="block text-right" :class="cell.toneClass">{{ cell.latency }}</span>
        </DataTooltip>
      </template>
    </div>
    <div v-else-if="topPingNetworks.length > 0" class="flex flex-row">
      <DataTooltip
        v-for="(net, index) in topPingNetworks" :key="net.name" placement="top"
        :content="net.tooltip"
        content-class="whitespace-pre-wrap w-max px-1.5 !leading-[1.2] text-[11px]"
      >
        <div class="truncate text-[10px]">
          <span v-if="index" class="mx-1">·</span>
          <template v-for="(entry, entryIndex) in net.entries" :key="entry.key">
            <span v-if="entryIndex" class="opacity-40">/</span>
            <span :class="entry.toneClass">{{ entry.latency }}</span>
          </template>
        </div>
      </DataTooltip>
    </div>
    <div v-else class="truncate">
      N/A
    </div>
    <div class="flex flex-col gap-[1px] w-full pr-4">
      <div class="relative items-center gap-1">
        <div
          class="grid h-1 cursor-auto items-end gap-[1px] transition-all hover:h-2.5"
          :style="{ gridTemplateColumns: `repeat(${latencyRenderBars.length}, minmax(0, 1fr))` }"
        >
          <DataTooltip
            v-for="bar in latencyRenderBars" :key="bar.key" placement="top" :content="bar.tooltip"
            class="h-full w-full" content-class="whitespace-pre-wrap w-max px-1.5 !leading-[1.2] text-[11px]"
          >
            <span
              class="block h-full w-full rounded-[1px] transition-all hover:scale-y-160"
              :class="bar.className"
            />
          </DataTooltip>
        </div>
      </div>
      <div class="relative items-center gap-1">
        <div
          class="grid h-1 cursor-auto items-end gap-[1px] transition-all hover:h-2.5"
          :style="{ gridTemplateColumns: `repeat(${lossRenderBars.length}, minmax(0, 1fr))` }"
        >
          <DataTooltip
            v-for="bar in lossRenderBars" :key="bar.key" placement="top" :content="bar.tooltip"
            class="h-full w-full" content-class="whitespace-pre-wrap w-max px-1.5 !leading-[1.2] text-[11px]"
          >
            <span
              class="block h-full w-full rounded-[1px] transition-all hover:scale-y-160"
              :class="bar.className"
            />
          </DataTooltip>
        </div>
      </div>
    </div>
  </div>
</template>
