import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

if (import.meta.env.DEV) {
  const loadTestData = async () => {
    try {
      localStorage.clear();
      localStorage.setItem('rawdata', await (await fetch('/test-data.json')).text());
      console.debug("测试数据已加载");
    } catch (error) {
      console.warn('加载测试数据失败:', error);
    }
  };

  // 通过URL参数控制是否加载
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('ltd')) {
    loadTestData();
  } else {
    // nope.
  }
}

createApp(App).use(router).mount('#app')