<template>
  <NavMobile v-if="isMobile" />
  <NavDesktop v-if="!isMobile" />
  <div class="page-container">
    <router-view class="content" />
    <footer>
      <div class="footer-info">
        <p>© 2025 BPuffer. All rights reserved.</p>
        <!-- <p>
          <a href="https://beian.miit.gov.cn/" target="_blank">辽B2-12345678</a>
        </p> -->
      </div>
      <div class="sentinel"></div>
    </footer>
  </div>

</template>

<script setup>
import NavMobile from '@/components/NavMobile.vue'
import NavDesktop from '@/components/NavDesktop.vue'
import DataModel from '@/models/DataModel.js'

import { ref, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const REPO_URL = 'https://github.com/bpuffer/tsukimiya.site'
const isMobile = ref(false);
const route = useRoute();
const router = useRouter();

const checkDeviceType = () => {
  const userChoice = localStorage.getItem('deviceType');
  if (userChoice) return userChoice === 'mobile';

  const ua = navigator.userAgent.toLowerCase();
  return /mobile|android|iphone|ipad|ipod/i.test(ua);
};

onMounted(() => {
  console.log(`欢迎来到月宫の小站！翻阅源码请前往${REPO_URL}`)  // vite.config.js/build.terserOptions.compress.drop_console: false
  isMobile.value = checkDeviceType();
  if (isMobile.value) {
    router.push({ name: 'm' });
  }
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
/* body::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(255, 255, 255, 0.5);
  z-index: -1;
} */

@media (min-width: 768px) {
  body {
    background-image: url('@/assets/img/bg.png');
  }
}

.content {
  padding: 15px;
  min-height: calc(100vh - 128px);
  background-color: transparent;
}

.page-container {
  display: flex;
  flex-direction: column;
}

.sentinel {
  height: 64px;
}

footer {
  margin-top: 10px;
  border-top: 2px solid;
  border-image: linear-gradient(90deg, #a8a, #fdf) 1;
  background-color: rgba(255, 255, 255, 0.5);
}

.footer-info {
  text-align: center;
  padding: 0;
  margin: 0;
}

.footer-info p {
  color: #444;
  margin: 0;
}

.footer-info a {
  color: #444;
  text-decoration: none;
}

@media (max-width: 425px) {
  .content {
    margin-left: 0;
  }
}
</style>