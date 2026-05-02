<script setup lang="ts">
import { ref, onMounted } from "vue";

const props = defineProps<{
  adClient: string;
  adSlot: string;
  adFormat?: string;
  width?: number;
  height?: number;
}>();

const isLoaded = ref(false);
const isInView = ref(false);
const adRef = ref<HTMLElement | null>(null);

const adFormat = props.adFormat || "auto";
const width = props.width || "100%";
const height = props.height || 120;

onMounted(() => {
  if (typeof window === "undefined") return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          isInView.value = true;
          loadAd();
          observer.disconnect();
        }
      });
    },
    {
      rootMargin: "200px",
      threshold: 0,
    }
  );

  if (adRef.value) {
    observer.observe(adRef.value);
  }
});

const loadAd = () => {
  if (typeof window === "undefined" || isLoaded.value) return;

  isLoaded.value = true;

  if (typeof window.adsbygoogle !== "undefined") {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  }
};

declare global {
  interface Window {
    adsbygoogle: unknown[];
    partytown?: {
      forward: string[];
    };
  }
}
</script>

<template>
  <div
    ref="adRef"
    class="adsense-container"
    :style="{
      width: typeof width === 'number' ? width + 'px' : width,
      minHeight: typeof height === 'number' ? height + 'px' : height,
    }"
  >
    <ins
      v-if="isInView"
      class="adsbygoogle"
      :style="{
        display: 'block',
        width: typeof width === 'number' ? width + 'px' : width,
        height: typeof height === 'number' ? height + 'px' : height,
      }"
      :data-ad-client="adClient"
      :data-ad-slot="adSlot"
      :data-ad-format="adFormat"
      data-full-width-responsive="true"
    />
    <div v-if="!isLoaded" class="ad-placeholder">
      <div class="ad-placeholder-content">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="9" y1="21" x2="9" y2="9" />
        </svg>
        <span>Advertisement</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.adsense-container {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f5f7fa 0%, #e4e8ec 100%);
  border-radius: 8px;
  overflow: hidden;
  position: relative;
}

.adsense-container :deep(ins) {
  display: block !important;
}

.ad-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f5f7fa 0%, #e4e8ec 100%);
}

.ad-placeholder-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: #9ca3af;
  font-size: 12px;
}

.ad-placeholder-content svg {
  opacity: 0.5;
}
</style>
