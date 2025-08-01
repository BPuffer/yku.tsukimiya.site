<template>
  <div class="profile-container">
    <div class="user-grid">
      <!-- 用户卡片 -->
      <div v-for="(user, id) in dataModel.allLoginUsers" :key="id" 
           class="user-card" 
           :class="{ active: dataModel.currentLoginUser === id }">
        <div class="user-card-top">
          <div v-if="!user.profile?.icon" class="user-card-text-avatar">
            {{ user.profile?.学生姓名?.charAt(0) || '?' }}
          </div>
          <div v-else class="user-card-icon-avatar">
            <img :src="user.profile.icon" alt="头像">
          </div>
          <div class="user-card-ni">
            <p class="user-card-name">{{ user?.profile?.学生姓名 || '佚名' }}</p>
            <p class="user-card-id">{{ id }}</p>
          </div>
        </div>
        
        <div class="user-card-bottom">
          <p>{{ user?.profile?.所属院系 || '未知院系' }} · {{ user?.profile?.班级名称 || '未知班级' }}</p>
        </div>
        
        <div class="user-card-actions">
          <button class="user-card-action-login"
            v-if="dataModel.currentLoginUser !== id"
            @click="loginUser(id)" 
            :disabled="dataModel.currentLoginUser === id"
            :class="{ disabled: dataModel.currentLoginUser === id }"
          >
            <i class="fas fa-sign-in-alt"></i>
            登录
          </button>
          
          <button class="user-card-action-refresh"
            v-if="dataModel.currentLoginUser === id"
            @click="refreshUser" 
            :disabled="dataModel.currentLoginUser !== id"
            :class="{ disabled: dataModel.currentLoginUser !== id }"
          >
            <i class="fas fa-sync"></i>
            刷新
          </button>
          
          <button class="user-card-action-delete" @click="deleteUser(id, true)">
            <i class="fas" :class="{
              'fas-trash-alt': dataModel.currentLoginUser !== id,
              'fa-arrow-right-from-bracket': dataModel.currentLoginUser === id
            }"></i>
            <span>{{ dataModel.currentLoginUser === id ? "登出" : "删除" }}</span>
          </button>
        </div>
      </div>
      
      <!-- 添加账号卡片 -->
      <div class="user-card add-card" @click="showAddForm = true">
        <div class="add-icon">
          <i class="fas fa-plus"></i>
        </div>
      </div>

      <!-- 哨兵 -->
      <div class="sentinel"></div>
    </div>

    <!-- 添加账号表单 -->
    <div v-if="showAddForm" class="add-form-overlay">
      <div class="add-form">
        <div class="form-header">
          <h3>添加新账号</h3>
          <button @click="cancelAdd">
            <i class="fas fa-times"></i>
          </button>
        </div>
        
        <div class="form-group">
          <label for="username">学号</label>
          <input 
            type="text" 
            id="username" 
            v-model="newUsername" 
            placeholder="请输入学号"
          >
        </div>
        
        <div class="form-group">
          <label for="password">密码</label>
          <input 
            type="password" 
            id="password" 
            v-model="newPassword" 
            placeholder="请输入密码"
          >
        </div>
        
        <button 
          class="submit-btn" 
          @click="startLogin" 
          :disabled="loginInProgress"
        >
          <span v-if="loginInProgress" class="spinner"></span>
          <!-- 直接在按钮上显示状态 -->
          {{ loginInProgress ? (loginInProgressMessage || '登录中...') : (loginError ? '登录失败' : '登录') }}
        </button>
        <div v-if="loginError" class="error-message">
          {{ loginError }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import DataModel from '@/models/DataModel'

// 创建响应式数据模型实例
const dataModel = reactive(DataModel)

// 添加账号相关状态
const showAddForm = ref(false)
const newUsername = ref('')
const newPassword = ref('')
const loginInProgress = ref(false)

// 登录用户
async function loginUser(id) {
  try {
    // 登出当前用户（如果存在）
    if (dataModel.currentLoginUser) {
      await dataModel.logout(true)
    }
    
    // 获取用户信息并登录
    const user = dataModel.allLoginUsers[id]
    await dataModel.login(id, user.password)
    
    // 更新数据模型
    dataModel.mergeCurrent()
    dataModel.saveAllToLocal()
  } catch (error) {
    console.error('登录失败:', error.message)
  }
}

// 刷新当前用户数据
async function refreshUser() {
  if (!dataModel.currentLoginUser) return
  
  try {
    await dataModel.updateAll()
    dataModel.mergeCurrent()
    dataModel.saveAllToLocal()
  } catch (error) {
    console.error('刷新失败:', error.message)
  }
}

// 删除/登出按钮
async function deleteUser(id) {
  try {
    // 如果删除的是当前用户，登出
    if (dataModel.currentLoginUser === id) {
      await dataModel.logout(true)
    } else {  // 删除用户
      dataModel.delete(id)
      dataModel.saveAllToLocal()
    }
  } catch (error) {
    console.error('删除失败:', error.message)
  }
}

// 开始添加账号流程
const loginError = ref('')
const loginInProgressMessage = ref('')

async function startLogin() {
  loginInProgress.value = true
  loginError.value = ''

  try {
    // 使用输入的用户名密码登录
    console.log(`newUsername.value=${newUsername.value},newPassword.value=${newPassword.value}`)
    await dataModel.login(newUsername.value, newPassword.value, false)
    loginInProgressMessage.value = "登录成功！获取数据中"
    console.debug("登录成功！获取数据中")

    // 获取用户完整数据
    await dataModel.updateAll()
    
    // 保存到本地存储
    dataModel.mergeCurrent()
    dataModel.saveAllToLocal()

    // 关闭表单
    showAddForm.value = false
    resetFormState()
  } catch (error) {
    // 捕获并显示错误信息
    loginError.value = `登录失败: ${error.message}`
  } finally {
    loginInProgress.value = false
  }
}

// 取消添加表单
function cancelAdd() {
  showAddForm.value = false
  resetFormState()
}

// 重置表单状态
function resetFormState() {
  newUsername.value = ''
  newPassword.value = ''
  loginInProgress.value = false
  loginInProgressMessage.value = ''
}
</script>

<style scoped>

.profile-container {
  padding: 12px;
  max-width: 100vw;
  box-sizing: border-box;
}

.user-grid {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-bottom: 20px;
}

/* #region 用户卡片 */

.user-card {
  background-color: #fff7f780;
  border-radius: 16px;
  padding: 8px 16px;
  display: flex;
  flex: 1;
  flex-direction: column;
  backdrop-filter: blur(4px);
  border: 1px solid rgba(0, 0, 0, 0.05);
}

.user-card.active {
  border: 2px solid #4a90e2;
}

/* #region 顶部信息 */
.user-card-top {
  display: flex;
  align-items: center;
  justify-content: space-around;
  gap: 12px;
  margin-bottom: 12px;
}

.user-card-text-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #6a11cb 0%, #2575fc 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 18px;
  flex-shrink: 0;
}

.user-card-icon-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
}

.user-card-icon-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.user-card-ni {
  display: flex;
  flex: 1;
  flex-direction: column;
  padding: 0px 16px;
  border-left: 2px #4a90e2c0 solid;
}

.user-card-name {
  flex: 1;
  font-weight: bold;
  margin: 0;
  box-sizing: border-box;
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-card-id {
  margin: 0;
  font-size: 12px;
  color: #666;
  opacity: 0.8;
}

.user-card-bottom {
  margin-top: auto;
  font-size: 13px;
  color: #555;
  opacity: 0.9;
  line-height: 1.4;
}

.user-card-bottom p {
  margin: 0;
}
/* #endregion */

/* #region 操作按钮 */
.user-card-actions {
  display: flex;
  margin-top: 14px;
  gap: 6px;
}

.user-card-actions button {
  flex: 1;
  border: none;
  border-radius: 8px;
  padding: 6px 4px;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.user-card-action-login {
  background-color: #4CAF50;
  color: white;
}

.user-card-action-login:disabled {
  background-color: #a5d6a7;
  cursor: not-allowed;
}

.user-card-action-refresh {
  background-color: #2196F3;
  color: white;
}

.user-card-action-refresh:disabled {
  background-color: #90caf9;
  cursor: not-allowed;
}

.user-card-action-delete {
  background-color: #f44336;
  color: white;
}
/* #endregion */

/* #endregion */

/* #region 卡片后面的东西 */
.add-card {
  background: rgba(255, 247, 247, 0.75) !important;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border: 2px dashed #bbb !important;
}

.add-icon {
  font-size: 32px;
  color: #888;
}

.sentinel {
  height: 64px;
  width: 100%;
}
/* #endregion */

/* #region 新登录表单 */
.add-form-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.add-form {
  background-color: rgba(255, 247, 247, 0.9);
  width: 85vw;
  max-width: 320px;
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(12px);
}

.form-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.form-header h3 {
  margin: 0;
  font-size: 18px;
}

.form-header button {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: #666;
}

.form-group {
  margin-bottom: 18px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 14px;
  color: #444;
}

.form-group input {
  width: 100%;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid #ddd;
  background: rgba(255, 255, 255, 0.7);
  font-size: 15px;
  box-sizing: border-box;
}

.submit-btn {
  width: 100%;
  padding: 14px;
  background-color: #4a90e2;
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  position: relative;
}

.submit-btn:disabled {
  background-color: #90caf9;
  cursor: not-allowed;
}

.spinner {
  display: inline-block;
  width: 20px;
  height: 20px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: white;
  animation: spin 1s linear infinite;
  margin-right: 10px;
  vertical-align: middle;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-message {
  margin-top: 16px;
  padding: 12px;
  border-radius: 8px;
  background-color: rgba(244, 67, 54, 0.2);
  color: #c62828;
  font-size: 14px;
  text-align: center;
}

/* #endregion */

</style>