import encryptPassword from '@/module/encrypt.js';
const PROXY_URL = import.meta.env.VITE_PROXY_DOMAIN || "localhost:5000";
const USE_HTTPS = import.meta.env.VITE_PROXY_HTTPS === "true" || false;

function proxyTo(url) {
  if (!url) return '';
  let protocol = USE_HTTPS ? 'https://' : 'http://';
  let rest = url;

  if (url.startsWith('http://')) {
    protocol = 'http://';
    rest = url.slice(7);
  } else if (url.startsWith('https://')) {
    rest = url.slice(8);
  } else if (url.startsWith('//')) {
    rest = url.slice(2);
  }

  return `${protocol}${PROXY_URL}/${rest}`;
}

const DEFAULT_RAWDATA = JSON.stringify({
  currentLoginUser: null,
  allLoginUsers: {},
  server: {}
});

const ERROR_MSGS = {
  "CORS": "请检查是否在正确的域名下运行。不要使用ip直接访问。",
  429: '请求过于频繁，请稍后再试',
  502: '服务器掉线。\n这通常不是你的问题。你可以尝试联系网站管理员。\n(vx:mcpuffer)',
}

function rethrow(err) {
  if (err.message.includes("Failed to fetch")) {
    return new Error(`不预期的无法连接错误。\n可能是后端代理服务器未启用`);
  }
  return new Error(`不预期的错误：${err.message}。\n请将此界面截图及最近操作回报给开发者。\n(vx:mcpuffer)`);
}

class JWXT {
  constructor(username, password) {
    this.JWGL_URL = "https://jwgl.yku.edu.cn";
    this.JWGL_AUTH_APP = "http://jwgl.yku.edu.cn/sso.jsp";
    this.AUTH_URL = "https://authserver.yku.edu.cn";
    this.SEMESTER_START_DATE = {
      "2024-2025-2": "2025-03-04",
      "2025-2026-1": "2025-09-01"
    }

    this.username = username;
    this.password = password;
    this._loggedIn = false;
  }

  // 登录
  async login() {
    console.debug(`教务系统实例尝试开始登录: ${this.username}`);
    try {
      // 步骤1: 获取初始Cookie
      console.debug(`- 获取初始Cookie: ${this.JWGL_URL}`);
      const jwxtInitPromise = fetch(proxyTo(this.JWGL_URL), {
        credentials: 'include',
      }).then(response => {
        if (response.status == 502) throw new Error(ERROR_MSGS[502]);
        if (response.status == 429) throw new Error(ERROR_MSGS[429]);
        if (!response.ok) throw new Error(`未知错误 (${response.status})`);
        return response;
      }).catch(err => { throw rethrow(err) });

      // 步骤2: 获取登录页面和salt
      console.debug(`- 获取登录页面和salt: ${this.AUTH_URL}/authserver/login`);
      const loginParams = new URLSearchParams({ service: this.JWGL_AUTH_APP });
      const loginUrl = `${this.AUTH_URL}/authserver/login?${loginParams}`;
      const loginResponse = await fetch(proxyTo(loginUrl), {
        credentials: 'include'
      }).then(response => {
        if (response.status == 502) throw new Error(ERROR_MSGS[502]);
        if (response.status == 429) throw new Error(ERROR_MSGS[429]);
        if (!response.ok) throw new Error(`未知错误 (${response.status})`);
        return response;
      }).catch(err => { 
        console.error("正在重写并抛出这个错误：", err);
        throw rethrow(err)
      });

      if (loginResponse.url.includes('xsMain.jsp')) {
        this._loggedIn = true;
        console.debug(`- 备登录成功: ${loginResponse.url}`);
        return true;
      }
      const loginHtml = await loginResponse.text();
      const parser = new DOMParser();
      const loginDoc = parser.parseFromString(loginHtml, 'text/html');
      const formEleDesktoop = loginDoc.getElementById('pwdFromId');  // 电脑端
      const formEle = formEleDesktoop || loginDoc.getElementById('pwdLoginDiv');  // 手机端
      if (!formEle) { throw new Error("返回页面结构不预期") }
      const salt = formEle.querySelector('#pwdEncryptSalt')?.value;
      if (!salt) { throw new Error("无法获取加密盐") }


      // 步骤3: 检查是否需要验证码
      // console.debug(`- 检查是否需要验证码: ${this.AUTH_URL}/authserver/checkNeedCaptcha.htl`);
      // const captchaUrl = `${this.AUTH_URL}/authserver/checkNeedCaptcha.htl`;
      // const captchaParams = new URLSearchParams({
      //   username: this.username,
      //   _: Date.now()
      // });
      // const captchaResponse = await fetch(proxyTo(`${captchaUrl}?${captchaParams}`), {
      //   credentials: 'include'
      // });
      // const captchaData = await captchaResponse.json();
      // if (captchaData.isNeed) { throw new Error("需要验证码。去官网登录一下就行了。只登录可以手机。"); }

      await jwxtInitPromise;

      // 步骤4: 准备登录数据
      console.debug(`- 准备登录数据: ${this.AUTH_URL}/authserver/login`);
      const execution = formEle.querySelector('input[name="execution"]').value;
      const formData = new URLSearchParams();
      formData.append('username', this.username);
      formData.append('password', encryptPassword(this.password, salt));
      formData.append('captcha', '');
      formData.append('_eventId', 'submit');
      formData.append('cllt', 'userNameLogin');
      formData.append('dllt', 'generalLogin');
      formData.append('lt', '');
      formData.append('execution', execution);

      // 步骤5: 提交登录请求
      console.debug(`- 提交登录请求: ${loginUrl}`);
      let loginResult = await fetch(proxyTo(loginUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData,
        credentials: 'include'
        // redirect: 'manual'
      }).then(response => {
        if (response.status == 502) throw new Error(ERROR_MSGS[502]);
        if (response.status == 429) throw new Error(ERROR_MSGS[429]);
        if (!response.ok) throw new Error(`未知错误 (${response.status})`);
        return response;
      }).catch(rethrow);

      // 步骤6: 验证登录结果
      console.debug(`- 验证登录结果: ${loginResult.url}`);
      if (loginResult.url.includes('xsMain.jsp')) {
        this._loggedIn = true;
        return true;
      } else {
        if (loginResult.status == 401) {
          throw new Error(`用户名或密码错误`);
        } else if (loginResult.status >= 500) {
          throw new Error(`会话超时。请尝试刷新页面。多次刷新无果可能是教务官网似了。`);
        }
        throw new Error(`登录失败。URL: ${loginResult.url}`);
      }
    } catch (err) {
      const newerr = rethrow(err);
      throw newerr;
    }
  }

  /**
   * @deprecated 登录速度问题已经改善，登录轮询器未更新
   */
  async *loginTaskGenerator() {
    const self = this;
    console.debug(`教务系统实例尝试登录: ${self.username}, ${self.password}`);
    yield { type: "progress", message: "开始登录流程..." };

    try {
      // 步骤1: 同时发起初始Cookie请求和登录页面请求
      yield { type: "progress", message: "获取初始Cookie..." };
      console.debug(`- 获取初始Cookie: ${self.JWGL_URL}`);
      const jwxtInitPromise = fetch(proxyTo(self.JWGL_URL), {
        credentials: 'include',
      }).then(response => {
        if (response.status == 502) throw new Error(ERROR_MSGS[502]);
        if (response.status == 429) throw new Error(ERROR_MSGS[429]);
        if (!response.ok) throw new Error(`未知错误 (${response.status})`);
        return response;
      }).catch(rethrow);

      // 步骤2: 获取登录页面和salt
      yield { type: "progress", message: "获取登录页面..." };
      console.debug(`- 获取登录页面和salt: ${self.AUTH_URL}/authserver/login`);
      const loginParams = new URLSearchParams({ service: self.JWGL_AUTH_APP });
      const loginUrl = `${self.AUTH_URL}/authserver/login?${loginParams}`;
      const loginResponse = await fetch(proxyTo(loginUrl), {
        credentials: 'include'
      }).then(response => {
        if (response.status == 502) throw new Error(ERROR_MSGS[502]);
        if (response.status == 429) throw new Error(ERROR_MSGS[429]);
        if (!response.ok) throw new Error(`未知错误 (${response.status})`);
        return response;
      }).catch(rethrow);

      // 检查是否已经登录
      if (loginResponse.url.includes('xsMain.jsp')) {
        self._loggedIn = true;
        console.debug(`- 备登录成功: ${loginResponse.url}`);
        return { type: "success", result: true };
      }

      const loginHtml = await loginResponse.text();
      const parser = new DOMParser();
      const loginDoc = parser.parseFromString(loginHtml, 'text/html');

      // 处理不同设备的表单元素
      const formEleDesktoop = loginDoc.getElementById('pwdFromId');
      const formEle = formEleDesktoop || loginDoc.getElementById('pwdLoginDiv');
      if (!formEle) {
        console.debug(loginDoc);
        throw new Error("无法找到登录表单");
      }

      // 获取加密盐
      const salt = formEle.querySelector('#pwdEncryptSalt')?.value;
      if (!salt) {
        console.debug(formEle);
        throw new Error("无法获取加密盐");
      }

      // 步骤3: 检查是否需要验证码
      yield { type: "progress", message: "检查验证码需求..." };
      console.debug(`- 检查是否需要验证码: ${self.AUTH_URL}/authserver/checkNeedCaptcha.htl`);
      const captchaUrl = `${self.AUTH_URL}/authserver/checkNeedCaptcha.htl`;
      const captchaParams = new URLSearchParams({
        username: self.username,
        _: Date.now()
      });

      const captchaResponse = await fetch(proxyTo(`${captchaUrl}?${captchaParams}`), {
        credentials: 'include'
      }).then(response => {
        if (response.status == 502) throw new Error(ERROR_MSGS[502]);
        if (response.status == 429) throw new Error(ERROR_MSGS[429]);
        if (!response.ok) throw new Error(`未知错误 (${response.status})`);
        return response;
      }).catch(rethrow);

      if (!captchaResponse.ok) {
        throw new Error(`验证码检查请求失败: ${captchaResponse.status}`);
      }

      const captchaData = await captchaResponse.json();
      if (captchaData.isNeed) {
        throw new Error("需要验证码，当前实现不支持");
      }

      // 等待初始Cookie请求完成
      yield { type: "progress", message: "等待系统初始化完成..." };
      await jwxtInitPromise;

      // 步骤4: 准备登录数据
      yield { type: "progress", message: "准备登录数据..." };
      console.debug(`- 准备登录数据: ${self.AUTH_URL}/authserver/login`);
      const execution = formEle.querySelector('input[name="execution"]').value;
      const formData = new URLSearchParams();
      formData.append('username', self.username);
      formData.append('password', encryptPassword(self.password, salt));
      formData.append('captcha', '');
      formData.append('_eventId', 'submit');
      formData.append('cllt', 'userNameLogin');
      formData.append('dllt', 'generalLogin');
      formData.append('lt', '');
      formData.append('execution', execution);

      // 步骤5: 提交登录请求
      yield { type: "progress", message: "提交登录请求..." };
      console.debug(`- 提交登录请求: ${loginUrl}`);
      const loginResult = await fetch(proxyTo(loginUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData,
        credentials: 'include'
      }).then(response => {
        if (response.status == 502) throw new Error(ERROR_MSGS[502]);
        if (response.status == 429) throw new Error(ERROR_MSGS[429]);
        if (!response.ok) throw new Error(`未知错误 (${response.status})`);
        return response;
      }).catch(rethrow);

      // 步骤6: 验证登录结果
      yield { type: "progress", message: "验证登录结果..." };
      console.debug(`- 验证登录结果: ${loginResult.url}`);
      const finalUrl = loginResult.url;

      if (finalUrl.includes('xsMain.jsp')) {
        self._loggedIn = true;
        return { type: "success", result: true };
      } else {
        // 尝试获取错误信息
        const errorHtml = await loginResult.text();
        const errorDoc = parser.parseFromString(errorHtml, 'text/html');
        const errorMsg = errorDoc.querySelector('.auth_error')?.textContent?.trim() || '未知错误';
        throw new Error(`登录失败: ${errorMsg} | 最终URL: ${finalUrl}`);
      }
    } catch (error) {
      console.error("登录过程中出错:", error);
      return {
        type: "error",
        message: error.message || "未知错误",
        details: error.stack
      };
    }
  }

  // 退出登录
  async logout() {
    // GET https://authserver.yku.edu.cn/authserver/logout?service=https%3A%2F%2Fjwgl.yku.edu.cn%2Fjsxsd
    try {
      const logoutUrl = `${this.AUTH_URL}/authserver/logout?service=${encodeURIComponent(this.JWGL_URL)}`;
      await fetch(proxyTo(logoutUrl), {
        credentials: 'include'
      }).then(response => {
        if (response.status == 502) throw new Error(ERROR_MSGS[502]);
        if (response.status == 429) throw new Error(ERROR_MSGS[429]);
        if (!response.ok) throw new Error(`未知错误 (${response.status})`);
        return response;
      }).catch(()=>{});
    } catch (error) {
      console.error("退出登录过程中出错:", error);
      // 不传播异常，因为此方法本身就是安全方法
    }
  }

  // 获取成绩
  async getGrades(semester) {
    if (!this._loggedIn) {
      throw new Error("请先登录");
    }

    try {
      // 1. 获取培养方案
      const index = {};

      const pyfaUrl = `${this.JWGL_URL}/jsxsd/pyfa/pyfa_query`;
      const pyfaResponse = await fetch(proxyTo(pyfaUrl), {
        credentials: 'include'
      }).then(response => {
        if (response.status == 502) throw new Error(ERROR_MSGS[502]);
        if (response.status == 429) throw new Error(ERROR_MSGS[429]);
        if (!response.ok) throw new Error(`未知错误 (${response.status})`);
        return response;
      }).catch(rethrow);
      const pyfaHtml = await pyfaResponse.text();
      const pyfaDoc = new DOMParser().parseFromString(pyfaHtml, 'text/html');
      const pyfaTable = pyfaDoc.getElementById('dataList');

      if (!pyfaTable) {
        throw new Error("培养方案表格未找到");
      }
      const pyfaData = this.parseTable(pyfaTable, "课程编号");
      const indexHeaders = Array.from(pyfaTable.querySelectorAll('th'))
        .map(th => th.textContent.trim());
      for (const [id, value] of Object.entries(pyfaData)) {
        index[id] = { ...value, 考试成绩: null, 考试安排: null };
      }

      // 2. 获取考试成绩
      const cjcxUrl = `${this.JWGL_URL}/jsxsd/kscj/cjcx_list`;
      const cjcxResponse = await fetch(proxyTo(cjcxUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        credentials: 'include'
      }).then(response => {
        if (response.status == 502) throw new Error(ERROR_MSGS[502]);
        if (response.status == 429) throw new Error(ERROR_MSGS[429]);
        if (!response.ok) throw new Error(`未知错误 (${response.status})`);
        return response;
      }).catch(rethrow);

      const cjcxHtml = await cjcxResponse.text();
      const cjcxDoc = new DOMParser().parseFromString(cjcxHtml, 'text/html');
      const cjcxTable = cjcxDoc.getElementById('dataList');

      if (cjcxTable) {
        const gradesData = this.parseTable(cjcxTable, "课程编号");

        for (const [id, grade] of Object.entries(gradesData)) {
          if (index[id]) {
            index[id].考试成绩 = {};
            for (const [k, v] of Object.entries(grade)) {
              if (!(k in index[id])) {
                index[id].考试成绩[k] = v;
              }
            }
          } else {
            console.log(`有成绩的课程 ${grade["课程名称"]} 不在培养方案中`);
            index[id] = {
              ...grade,
              考试成绩: {},
              考试安排: null
            };

            for (const [k, v] of Object.entries(grade)) {
              if (!indexHeaders.includes(k)) {
                index[id].考试成绩[k] = v;
              }
            }
          }
        }
      }

      // 3. 获取考试安排
      const xsksapUrl = `${this.JWGL_URL}/jsxsd/xsks/xsksap_list`;
      const formData = new URLSearchParams({
        xnxqid: semester || this.dm.currentSemester
      });

      const xsksapResponse = await fetch(proxyTo(xsksapUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
        credentials: 'include'
      }).then(response => {
        if (response.status == 502) throw new Error(ERROR_MSGS[502]);
        if (response.status == 429) throw new Error(ERROR_MSGS[429]);
        if (!response.ok) throw new Error(`未知错误 (${response.status})`);
        return response;
      }).catch(rethrow);

      const xsksapHtml = await xsksapResponse.text();
      const xsksapDoc = new DOMParser().parseFromString(xsksapHtml, 'text/html');
      const xsksapTable = xsksapDoc.getElementById('dataList');

      if (xsksapTable) {
        const arrangementData = this.parseTable(xsksapTable, "课程编号", ["备注", "操作"]);

        for (const [id, arr] of Object.entries(arrangementData)) {
          if (index[id]) {
            index[id].考试安排 = {};
            for (const [k, v] of Object.entries(arr)) {
              if (!(k in index[id])) {
                index[id].考试安排[k] = v;
              }
            }
          } else {
            console.log(`有考试安排的课程 ${arr["课程名称"]} 不在培养方案中`);
            if (!index[id]) {
              index[id] = {
                考试成绩: null,
                考试安排: {}
              };
            }

            for (const [k, v] of Object.entries(arr)) {
              if (indexHeaders.includes(k)) {
                index[id][k] = v;
              } else {
                if (!index[id].考试安排) index[id].考试安排 = {};
                index[id].考试安排[k] = v;
              }
            }
          }
        }
      }
      return { subjects: Object.values(index) };
    } catch (error) {
      console.error("获取成绩时出错:", error);
      throw error;
    }
  }

  // 解析HTML表格为对象字典
  parseTable(table, keyColumn, excludeColumns = []) {
    const result = {};

    // 获取表头
    const headers = Array.from(table.querySelectorAll('th')).map(
      th => th.textContent.trim()
    );

    // 处理表格行
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(tr => {
      const cols = Array.from(tr.querySelectorAll('td')).map(
        td => td.textContent.trim()
      );

      if (cols.length > 0) {
        const rowData = {};
        headers.forEach((header, index) => {
          rowData[header] = cols[index];
        });

        const key = rowData[keyColumn];
        if (key) {
          // 排除指定列
          excludeColumns.forEach(col => {
            delete rowData[col];
          });
          result[key] = rowData;
        }
      }
    });

    return result;
  }

  // 获取课表
  async getSchedule(semester) {
    // 常量定义
    const START_DATE = new Date(this.SEMESTER_START_DATE[semester]);
    const TOTAL_WEEKS = 25; // 总周数

    // 请求和响应处理函数
    const task41 = async (week) => {
      const formData = new URLSearchParams();
      formData.append("zc", week);
      formData.append("xnxq01id", semester);

      const response = await fetch(proxyTo(`${this.JWGL_URL}/jsxsd/xskb/xskb_list.do`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
        credentials: 'include'
      }).then(response => {
        if (response.status == 502) throw new Error(ERROR_MSGS[502]);
        if (response.status == 429) throw new Error(ERROR_MSGS[429]);
        if (!response.ok) throw new Error(`未知错误 (${response.status})`);
        return response;
      }).catch(rethrow);

      if (!response.ok) {
        throw new Error(`请求失败: ${response.status}`);
      }

      const content = await response.text();
      if (content.length < 100) {
        throw new Error("登录失效");
      }

      // 使用DOMParser解析HTML
      const parser = new DOMParser();
      return parser.parseFromString(content, 'text/html');
    };

    // 并发获取所有周的课表
    const tasks = [];
    for (let w = 1; w <= TOTAL_WEEKS; w++) {
      tasks.push(task41(w));
    }
    const soups = await Promise.all(tasks);

    // 1. 解析时间段 (使用第一周)
    const kbtable = soups[0].getElementById('kbtable');
    if (!kbtable) {
      throw new Error(`返回体出现了结构问题: ${soups[0].body.innerHTML}`);
    }

    const times = [];
    // 获取第2-6行 (时间段行)
    const timeTrs = Array.from(kbtable.querySelectorAll('tr')).slice(1, 6);

    for (const tr of timeTrs) {
      const th = tr.querySelector('th');
      if (!th) {
        throw new Error(`返回体出现了结构问题: ${tr.outerHTML}`);
      }

      const timeText = th.textContent.trim();
      const match = timeText.match(/(\d{2}:\d{2})-(\d{2}:\d{2})/);
      if (!match) {
        throw new Error(`日期字符串问题: ${timeText}`);
      }

      times.push([match[1], match[2]]);
    }

    if (times.length !== 5) {
      throw new Error(`返回体出现了结构问题: ${kbtable.outerHTML}`);
    }

    // 2. 解析正常课程
    const mondays = {};

    for (let w = 0; w < TOTAL_WEEKS; w++) {
      const week = w + 1;
      const soup = soups[w];

      // 计算周一日期
      const mondayDate = new Date(START_DATE);
      mondayDate.setDate(mondayDate.getDate() + (week - 1) * 7);
      const dateStr = `${mondayDate.getFullYear()}${(mondayDate.getMonth() + 1).toString().padStart(2, '0')}${mondayDate.getDate().toString().padStart(2, '0')}`;

      const weekData = {
        week: week,
        weeks_all: TOTAL_WEEKS,
        schedules: null,
        week_course: null
      };

      // i. 检查表结构
      const kbtable = soup.getElementById('kbtable');
      if (!kbtable) {
        throw new Error(`返回体出现了结构问题: ${soup.body.innerHTML}`);
      }

      // 获取时间段行 (第2-6行)
      const timeTrs = Array.from(kbtable.querySelectorAll('tr')).slice(1, 6);

      // ii. 解析课程
      const schedulesFulfilled = {
        mon: Array(5).fill(null),
        tue: Array(5).fill(null),
        wed: Array(5).fill(null),
        thu: Array(5).fill(null),
        fri: Array(5).fill(null),
        sat: Array(5).fill(null),
        sun: Array(5).fill(null),
      };

      for (let timeIdx = 0; timeIdx < timeTrs.length; timeIdx++) {
        const tr = timeTrs[timeIdx];
        const tds = Array.from(tr.querySelectorAll('td'));

        if (tds.length !== 7) {
          throw new Error(`返回体出现了结构问题: ${tr.outerHTML}`);
        }

        const days = Object.keys(schedulesFulfilled);
        for (let dayIdx = 0; dayIdx < days.length; dayIdx++) {
          const day = days[dayIdx];
          const td = tds[dayIdx];

          // 查找有效的课程内容div
          const kbcontents = Array.from(td.querySelectorAll('div.kbcontent'));
          const divContent = kbcontents.find(content => {
            return content.textContent.trim().length >= 2;
          });

          if (!divContent) continue;

          const course = {
            课程名称: null,
            上课地点: null,
            授课教师: null,
            上课时间: null
          };

          // 提取课程名称 (直接文本节点)
          const nameParts = [];
          for (const node of divContent.childNodes) {
            if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
              nameParts.push(node.textContent.trim());
            }
          }
          course.课程名称 = nameParts.join(' ');

          // 提取font标签中的信息
          const fonts = divContent.querySelectorAll('font');
          for (const font of fonts) {
            const title = font.getAttribute('title');
            const text = font.textContent.trim();

            switch (title) {
              case "周次(节次)":
                course.上课时间 = text;
                break;
              case "教室":
                course.上课地点 = text;
                break;
              case "老师":
                course.授课教师 = text;
                break;
              default:
                console.warn(`未知的font title: ${title}`, font);
            }
          }

          // 添加到课表
          if (course.课程名称) {
            schedulesFulfilled[day][timeIdx] = course;
          }
        }
      }

      // 检查是否有课程数据
      const hasCourses = Object.values(schedulesFulfilled).some(
        dayCourses => dayCourses.some(course => course !== null)
      );

      if (hasCourses) {
        weekData.schedules = schedulesFulfilled;
      }

      mondays[dateStr] = weekData;
    }

    // 3. 解析整周课程 (使用第一周的文档)
    const allTrs = kbtable.querySelectorAll('tr');
    if (allTrs.length > 6) {
      const remarkTr = allTrs[6];
      if (remarkTr.textContent.includes('备注')) {
        const td = remarkTr.querySelector('td[colspan="7"]');
        if (td) {
          const coursesText = td.textContent.trim();
          const courses = coursesText.split(';').filter(c => c);

          for (const course of courses) {
            const parts = course.trim().split(/\s+/);
            if (parts.length < 3) {
              console.warn(`课程信息格式错误: ${course}`);
              continue;
            }

            const courseName = parts[0];
            const teacher = parts[1];
            const weekPart = parts[2];

            try {
              const weekNumbers = this.parseWeekString(weekPart);

              const courseObj = {
                课程名称: courseName,
                授课教师: teacher,
                上课时间: weekPart
              };

              for (const weekNum of weekNumbers) {
                if (weekNum >= 1 && weekNum <= TOTAL_WEEKS) {
                  // 计算周一日期
                  const mondayDate = new Date(START_DATE);
                  mondayDate.setDate(mondayDate.getDate() + (weekNum - 1) * 7);
                  const dateStr = `${mondayDate.getFullYear()}${(mondayDate.getMonth() + 1).toString().padStart(2, '0')}${mondayDate.getDate().toString().padStart(2, '0')}`;

                  if (mondays[dateStr]) {
                    mondays[dateStr].week_course = courseObj;
                  }
                }
              }
            } catch (e) {
              console.warn(`课程周次信息解析错误: ${weekPart}`, e);
            }
          }
        }
      }
    }

    return {
      times: times,
      mondays: mondays
    };
  }

  // 解析周次字符串
  parseWeekString(weekStr) {
    const weeks = [];
    const ranges = weekStr.replace('周', '').split(',');

    for (const range of ranges) {
      if (range.includes('-')) {
        const [start, end] = range.split('-').map(Number);
        for (let i = start; i <= end; i++) {
          weeks.push(i);
        }
      } else {
        weeks.push(Number(range));
      }
    }

    return weeks;
  }

  // 获取档案
  async getProfile() {
    if (!this._loggedIn) {
      throw new Error("未登录");
    }

    const profile = {};

    try {
      // 1. 获取个人信息页面
      const infoUrl = `${this.JWGL_URL}/jsxsd/framework/xsMain_new.jsp?t1=1`;
      const infoResponse = await fetch(proxyTo(infoUrl), {
        credentials: 'include'
      }).then(response => {
        if (response.status == 502) throw new Error(ERROR_MSGS[502]);
        if (response.status == 429) throw new Error(ERROR_MSGS[429]);
        if (!response.ok) throw new Error(`未知错误 (${response.status})`);
        return response;
      }).catch(rethrow);

      if (!infoResponse.ok) {
        throw new Error(`获取个人信息失败: ${infoResponse.status}`);
      }

      const infoHtml = await infoResponse.text();
      const parser = new DOMParser();
      const infoDoc = parser.parseFromString(infoHtml, 'text/html');

      // 2. 解析个人信息
      const container = infoDoc.querySelector('div.middletopttxlr');
      if (container) {
        const divs = Array.from(container.children).filter(
          el => el.tagName.toLowerCase() === 'div'
        );

        for (const div of divs) {
          const titleDiv = div.querySelector('div.middletopdwxxtit');
          const contentDiv = div.querySelector('div.middletopdwxxcont');

          if (titleDiv && contentDiv) {
            const title = titleDiv.textContent
              .trim()
              .replace('：', '')
              .replace(':', '');
            const content = contentDiv.textContent.trim();

            // 过滤空值和非目标字段
            if (content && content !== '&nbsp;' && [
              "学生姓名", "学生编号", "所属院系", "专业名称", "班级名称"
            ].includes(title)) {
              profile[title] = content;
            }
          }
        }
      }

      // 3. 获取学生照片
      const photoUrl = `${this.JWGL_URL}/jsxsd/grxx/xszpLoad`;
      const photoResponse = await fetch(proxyTo(photoUrl), {
        credentials: 'include'
      }).then(response => {
        if (response.status == 502) throw new Error(ERROR_MSGS[502]);
        if (response.status == 429) throw new Error(ERROR_MSGS[429]);
        if (!response.ok) throw new Error(`未知错误 (${response.status})`);
        return response;
      }).catch(rethrow);

      // 4. 转换为Base64编码
      if (photoResponse.ok) {
        const contentType = photoResponse.headers.get('Content-Type') || 'image/jpeg';
        if (contentType.startsWith('image/')) {
          const blob = await photoResponse.blob();
          const base64Image = await this.blobToBase64(blob);
          profile['icon'] = `data:${contentType};base64,${base64Image}`;
        } else {
          profile['icon'] = NO_ICON
        }
      } else {
        profile['icon'] = NO_ICON
      }

      return profile;
    } catch (error) {
      console.error("获取个人信息时出错:", error);
      throw error;
    }
  }

  // 将Blob转换为Base64
  blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result.split(',')[1];
        resolve(base64data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}

class DMUpdateModel {
  /* 
    DMUpdateModel 负责从教务系统获取新的数据，然后更新到DataModel中。
    DMUpdateModel 只更新DataModel.user。DataModel 可以提供保存方式。
  */
  constructor(datamodel) {
    this.dm = datamodel;
    this.jwxt = null;
  }

  async checkJwxt() {
    /*
      checkJwxt 用于立刻处理并更新更新器的教务系统实例。
      - true: 已经登录
      - false: 未登录
      - null: 没有正在登录的用户
    */
    if (!this.dm.currentLoginUser) {
      console.debug("- 没有正在登录的用户");
      if (this.jwxt) { await this.jwxt.logout() };
      this.jwxt = null;
      return null
    }
    if (this.jwxt) {
      if (this.jwxt.username == this.dm.currentLoginUser) {
        if (this.jwxt._loggedIn) {
          return true  // 是当前账号，已登录
        } else {
          return false  // 是当前账号，未登录
        }
      } else {
        if (this.jwxt._loggedIn) { await this.jwxt.logout() }  // 登出旧的教务系统
        this.jwxt = new JWXT(this.dm.user.id, this.dm.user.password);
        return false  // 不是当前账号，已经重置为当前账号，未登录
      }
    } else {
      this.jwxt = new JWXT(this.dm.user.id, this.dm.user.password);
      return false  // 新建的教务系统，未登录
    }
  }

  createLoginTask(username, password) {
    /*
      创建一个可轮询任务用于监察登录任务情况
      const loginTask = datamodel.updater.createLoginTask(username, password);
      const taskResult = loginTask.start()
      任何时候，通过loginTask.getStatus()检查任务完成情况
      如果
      status?.type === 'success' -> 顺利结束，使用 taskResult.then() 处理结果
      status?.type === 'progress' -> 任务处于某一步骤，使用 status?.message 获取提示
      status?.type === 'error' -> 任务产生了一个错误。使用 taskResult.then() 处理错误消息对象
    */
    this.checkJwxt()
    const generator = this.jwxt.loginTaskGenerator(username, password);
    let currentStatus = null;
    let isRunning = false;
    let isCancelled = false;

    const startPromise = (async () => {
      if (isCancelled) return { type: "cancelled" };

      isRunning = true;
      try {
        let next = await generator.next();
        currentStatus = next.value;

        while (!next.done && !isCancelled) {
          next = await generator.next();
          currentStatus = next.value;
        }

        return next.value || { type: "error", message: "未知错误" };
      } catch (error) {
        currentStatus = { type: "error", message: error.message };
        return error;
      } finally {
        isRunning = false;
      }
    })();

    return {
      getStatus: () => currentStatus,
      start: () => startPromise,
      cancel: () => {
        isCancelled = true;
        generator.return();
      }
    };
  }

  async login() {
    await this.checkJwxt()
    try {
      await this.jwxt.login();
    } catch (err) {
      await this.jwxt.logout();
      this.jwxt = null;
      throw err;
    }
  }

  async checkLogin() {
    const status = await this.checkJwxt()
    if (status !== null && !status) {
      await this.login()
    } else if (status === null) {
      console.error("无法登录，没有登录用户，请通过DataModel.login登录")
      throw new Error("无法登录，没有登录用户，请通过DataModel.login登录")
    }
  }

  async updateGrades(semester) {
    this.dm.user.exam = await this.jwxt.getGrades(semester || this.dm.lastSemester);
    this.dm.user.lastUpdate = new Date().toISOString();
  }

  async updateProfile() {
    this.dm.user.profile = await this.jwxt.getProfile();
    this.dm.user.lastUpdate = new Date().toISOString();
  }

  async updateSchedule(semester) {
    this.dm.user.schedule = await this.jwxt.getSchedule(semester || this.dm.currentSemester);
    this.dm.user.lastUpdate = new Date().toISOString();
  }

  async updateAll(includeSchedule = true) {
    await this.checkLogin()
    const updateSchedule = async () => {
      if (includeSchedule) {
        await this.updateSchedule()
      }
    }
    await Promise.all([
      updateSchedule(),
      this.updateGrades(),
      this.updateProfile()
    ]);
    this.dm.saveAllToLocal();
  }
}

class DataModel {
  /*
    用户状态：无/仅会话/仅数据/数据会话
    [内部操作] 仅会话->数据会话: 拉取数据(update)
    [用户操作] 数据会话->仅会话/仅数据->无: 重置数据(delete)
    [内部操作] 数据会话->仅数据/仅会话->无: 仅登出教务(logout)
    [定时函数] 仅数据->数据会话: 恢复会话(relogin)
    [用户操作] 无->仅数据: 从外部导入数据(import)
    [内部操作] 无->仅会话: 登录教务(login)

    [提供的操作] 无->仅会话->数据会话: 新增用户
    [提供的操作] 数据会话->仅会话->数据会话: 刷新数据
  */

  constructor() {
    this.proxy = PROXY_URL;
    this.lastSemester = "2024-2025-2"
    this.currentSemester = "2025-2026-1"
    this.currentLoginUser = null;
    this.allLoginUsers = {};
    this.user = null;
    this.server = {};
    this.updater = new DMUpdateModel(this);

    this.init();
  }

  init() {
    const rawData = localStorage.getItem('rawdata');
    if (rawData) {
      try {
        const data = JSON.parse(rawData);
        this.currentLoginUser = data.currentLoginUser || null;
        this.allLoginUsers = data.allLoginUsers || {};
        if (this.currentLoginUser) {
          this.user = this.allLoginUsers[this.currentLoginUser];
        }
        this.server = data?.server || {};
      } catch (error) {
        console.error('解析本地存储数据失败:', error);
        localStorage.setItem('rawdata', DEFAULT_RAWDATA);
        this.init();
      }
    } else {
      localStorage.setItem('rawdata', DEFAULT_RAWDATA);
    }
  }

  // 直接切换 currentLoginUser 为指定目标。可以不从教务系统更新。
  // *不会保存上一个用户的已修改内容。
  // 仅数据~.
  async changeToLogin(username, update = false) {
    if (!(username in this.allLoginUsers)) {
      throw new Error("未登录的用户")
    }
    await this.logout(false)
    this.currentLoginUser = username;
    this.user = this.allLoginUsers[this.currentLoginUser]
    if (update) {
      await this.login(this.user.id, this.user.password)
      await this.updateAll()
    }
    this.saveAllToLocal()
    return true;
  }

  // 无->仅会话->数据会话
  // 本方法为不提供进度信息的直接等待方法。进度信息使用更新器提供的任务管理器。
  async login(username, password, update = true) {
    if (this.currentLoginUser) {
      await this.logout()
    }

    // 创建新用户
    this.currentLoginUser = username
    this.user = {
      id: username,
      password,
      profile: null,
      schedule: null,
      exam: null
    }
    try {
      await this.updater.login()  // 尝试登录。更新器会读取当前用户的用户名和密码
    } catch (err) {
      this.currentLoginUser = null  // 取消创建的新用户
      this.user = null
      throw err
    }

    // 登录成功，更新后立刻锁定并保存到本地
    if (update) {
      await this.updateAll(true)
    }
    this.mergeCurrent()
    this.saveAllToLocal()
  }

  // 完全删除一个用户的本地数据
  // 数据会话->仅会话/仅数据->无
  async delete(username) {
    if (!(username in this.allLoginUsers)) {
      throw new Error(`不存在用户${username}，无法删除`)
    }
    delete this.allLoginUsers[username];
    if (this.currentLoginUser === username) {
      this.currentLoginUser = null;
      this.logout(false)
    }
  }

  // 更新当前登录用户的数据
  // 仅会话->数据会话
  async updateAll(updateSchedule = true) {
    await this.updater.updateAll(updateSchedule);
  }

  // 数据本地持久化
  saveAllToLocal() {
    const data = {
      currentLoginUser: this.currentLoginUser,
      allLoginUsers: this.allLoginUsers,
      server: this.server
    };
    localStorage.setItem('rawdata', JSON.stringify(data));
  }

  // 锁定当前用户的数据
  mergeCurrent() {
    if (!this.currentLoginUser) {
      throw new Error("没有登录的用户，无法锁定数据")
    }
    this.allLoginUsers[this.currentLoginUser] = this.user;
  }

  // 登出
  // 数据会话->仅数据/仅会话->无
  async logout(saveCurrent = true) {
    if (saveCurrent && this.currentLoginUser) {
      this.mergeCurrent();
    }
    this.currentLoginUser = null;
    this.user = null;
    await this.updater.checkJwxt();  // 清除教务系统实例
    this.saveAllToLocal();
  }
}

export default new DataModel();