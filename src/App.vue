<template>
  <NavMobile v-if="isMobile" />
  <NavDesktop v-if="!isMobile" />

  <router-view class="content" />
</template>

<script setup>
import NavMobile from '@/components/NavMobile.vue'
import NavDesktop from '@/components/NavDesktop.vue'
import DataModel from '@/models/DataModel.js'

import { ref, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';

const REPO_URL = 'https://github.com/bpuffer/tsukimiya.site'
const isMobile = ref(false);
const route = useRoute();

const checkDeviceType = () => {
  const userChoice = localStorage.getItem('deviceType');
  if (userChoice) return userChoice === 'mobile';
  
  const ua = navigator.userAgent.toLowerCase();
  return /mobile|android|iphone|ipad|ipod/i.test(ua);
};

onMounted(() => {
  console.log(`欢迎来到月宫の小站！翻阅源码请前往${REPO_URL}`)  // vite.config.js/build.terserOptions.compress.drop_console: false
  isMobile.value = checkDeviceType();
  DataModel.init(localStorage.getItem('rawdata'))
});
</script>

<style>
body {
  background-image: url('@/assets/img/mbg.png');
  background-repeat: no-repeat;
  background-position: center center;
  background-size: cover;
  background-attachment: fixed;

  max-width: 100%;
  height: 100%;
}

@media (min-width: 768px) {
  body {
    background-image: url('@/assets/img/bg.png');
  }
}

.content {
  padding: 15px;
}

@media (max-width: 425px) {
  .content {
    margin-left: 0;
  }
}
</style>