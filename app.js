const STORAGE_KEY = "mom-shopping-list-v1";
const LARGE_TEXT_KEY = "mom-shopping-large-text";
const QUICK_ITEMS_KEY = "mom-shopping-quick-items";
const REMINDER_KEY = "mom-shopping-reminder";

const defaultQuickItems = [
  "雞蛋",
  "牛奶",
  "青菜",
  "番茄",
  "米",
  "麵包",
  "紙巾",
  "洗衣液",
  "醬油"
];

const form = document.querySelector("#itemForm");
const input = document.querySelector("#itemInput");
const quickList = document.querySelector("#quickList");
const quickEditor = document.querySelector("#quickEditor");
const quickForm = document.querySelector("#quickForm");
const quickInput = document.querySelector("#quickInput");
const quickEditList = document.querySelector("#quickEditList");
const shoppingList = document.querySelector("#shoppingList");
const emptyState = document.querySelector("#emptyState");
const remainingCount = document.querySelector("#remainingCount");
const clearDoneButton = document.querySelector("#clearDoneButton");
const editQuickButton = document.querySelector("#editQuickButton");
const largeTextToggle = document.querySelector("#largeTextToggle");
const voiceButton = document.querySelector("#voiceButton");
const reminderButton = document.querySelector("#reminderButton");
const reminderModal = document.querySelector("#reminderModal");
const closeReminderButton = document.querySelector("#closeReminderButton");
const cancelReminderButton = document.querySelector("#cancelReminderButton");
const reminderSummary = document.querySelector("#reminderSummary");
const reminderList = document.querySelector("#reminderList");
const notificationStatus = document.querySelector("#notificationStatus");
const appAlert = document.querySelector("#appAlert");
const appAlertTitle = document.querySelector("#appAlertTitle");
const appAlertBody = document.querySelector("#appAlertBody");
const toast = document.querySelector("#toast");

let items = loadItems();
let quickItems = loadQuickItems();
let toastTimer;
let reminderTimer;
let alertTimer;
let recognition;
let isListening = false;
let serviceWorkerRegistration;

function loadItems() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveItems() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function loadQuickItems() {
  try {
    const saved = JSON.parse(localStorage.getItem(QUICK_ITEMS_KEY));
    return Array.isArray(saved) ? saved : defaultQuickItems;
  } catch {
    return defaultQuickItems;
  }
}

function saveQuickItems() {
  localStorage.setItem(QUICK_ITEMS_KEY, JSON.stringify(quickItems));
}

function loadSavedReminder() {
  try {
    return JSON.parse(localStorage.getItem(REMINDER_KEY));
  } catch {
    return null;
  }
}

function saveReminder(reminder) {
  localStorage.setItem(REMINDER_KEY, JSON.stringify(reminder));
}

function clearSavedReminder() {
  localStorage.removeItem(REMINDER_KEY);
}

function createItem(text) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    text,
    done: false,
    createdAt: Date.now()
  };
}

function addItem(rawText, options = {}) {
  const { focusAfterAdd = true } = options;
  const text = rawText.trim().replace(/\s+/g, " ");
  if (!text) {
    if (focusAfterAdd) input.focus();
    return;
  }

  items.unshift(createItem(text));
  saveItems();
  render();
  input.value = "";
  if (focusAfterAdd) input.focus();
  showToast(`已加入：${text}`);
}

function addSpokenItems(rawText) {
  const texts = rawText
    .split(/[，,、。；;]/)
    .map((text) => text.trim().replace(/\s+/g, " "))
    .filter(Boolean);

  if (!texts.length) return;

  texts.reverse().forEach((text) => {
    items.unshift(createItem(text));
  });
  saveItems();
  render();
  input.value = "";
  showToast(texts.length === 1 ? `語音加入：${texts[0]}` : `語音加入 ${texts.length} 樣`);
}

function toggleItem(id) {
  const hadActiveItems = items.some((item) => !item.done);
  items = items.map((item) => (
    item.id === id ? { ...item, done: !item.done } : item
  ));
  saveItems();
  render();
  const allDone = hadActiveItems && items.length > 0 && items.every((item) => item.done);
  if (allDone) {
    showAppAlert("都買齊啦", "清單全部勾完了，辛苦啦。");
  }
}

function deleteItem(id) {
  items = items.filter((item) => item.id !== id);
  saveItems();
  render();
}

function clearDoneItems() {
  const doneCount = items.filter((item) => item.done).length;
  if (!doneCount) {
    showToast("目前沒有已買的項目");
    return;
  }

  items = items.filter((item) => !item.done);
  saveItems();
  render();
  showToast(`清掉 ${doneCount} 樣已買`);
}

function activeItems() {
  return items
    .filter((item) => !item.done)
    .sort((a, b) => b.createdAt - a.createdAt);
}

function addQuickItem(rawText) {
  const text = rawText.trim().replace(/\s+/g, " ");
  if (!text) {
    quickInput.focus();
    return;
  }

  if (quickItems.includes(text)) {
    showToast("常買裡已經有這個了");
    quickInput.focus();
    return;
  }

  quickItems.push(text);
  saveQuickItems();
  renderQuickItems();
  quickInput.value = "";
  quickInput.focus();
  showToast(`已加入常買：${text}`);
}

function removeQuickItem(index) {
  const [removed] = quickItems.splice(index, 1);
  saveQuickItems();
  renderQuickItems();
  showToast(`已移除：${removed}`);
}

function renderQuickItems() {
  quickList.innerHTML = "";
  quickEditList.innerHTML = "";

  quickItems.forEach((text, index) => {
    const button = document.createElement("button");
    button.className = "quick-chip";
    button.type = "button";
    button.textContent = text;
    button.addEventListener("click", () => addItem(text, { focusAfterAdd: false }));
    quickList.append(button);

    const row = document.createElement("li");
    row.className = "quick-edit-item";

    const label = document.createElement("span");
    label.textContent = text;

    const removeButton = document.createElement("button");
    removeButton.className = "quick-remove";
    removeButton.type = "button";
    removeButton.textContent = "×";
    removeButton.setAttribute("aria-label", `從常買移除 ${text}`);
    removeButton.addEventListener("click", () => removeQuickItem(index));

    row.append(label, removeButton);
    quickEditList.append(row);
  });
}

function render() {
  const sortedItems = [...items].sort((a, b) => {
    if (a.done !== b.done) return Number(a.done) - Number(b.done);
    return b.createdAt - a.createdAt;
  });
  const activeCount = items.filter((item) => !item.done).length;

  shoppingList.innerHTML = "";
  emptyState.hidden = items.length > 0;
  remainingCount.textContent = `${activeCount} 樣未買`;

  sortedItems.forEach((item) => {
    const row = document.createElement("li");
    row.className = `shopping-item${item.done ? " done" : ""}`;

    const checkButton = document.createElement("button");
    checkButton.className = "item-check";
    checkButton.type = "button";
    checkButton.textContent = item.done ? "✓" : "";
    checkButton.setAttribute("aria-label", item.done ? "改成未買" : "標記已買");
    checkButton.addEventListener("click", () => toggleItem(item.id));

    const text = document.createElement("span");
    text.className = "item-text";
    text.textContent = item.text;

    const deleteButton = document.createElement("button");
    deleteButton.className = "item-delete";
    deleteButton.type = "button";
    deleteButton.textContent = "×";
    deleteButton.setAttribute("aria-label", `刪除 ${item.text}`);
    deleteButton.addEventListener("click", () => deleteItem(item.id));

    row.append(checkButton, text, deleteButton);
    shoppingList.append(row);
  });
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 1600);
}

function showAppAlert(title, message) {
  appAlertTitle.textContent = title;
  appAlertBody.textContent = message;
  appAlert.hidden = false;
  appAlert.classList.add("show");
  clearTimeout(alertTimer);
  alertTimer = setTimeout(() => {
    appAlert.classList.remove("show");
    setTimeout(() => {
      appAlert.hidden = true;
    }, 220);
  }, 5200);
}

function formatReminderLabel(minutes) {
  if (minutes === 60) return "1 小時";
  if (minutes === 180) return "3 小時";
  return `${minutes} 分鐘`;
}

function reminderMessage() {
  const remainingItems = activeItems();
  if (!remainingItems.length) return "目前沒有未買項目，可以安心收工。";

  const preview = remainingItems.slice(0, 3).map((item) => item.text).join("、");
  const more = remainingItems.length > 3 ? `，還有 ${remainingItems.length - 3} 樣` : "";
  return `還有 ${remainingItems.length} 樣沒買：${preview}${more}`;
}

function canUseBrowserNotifications() {
  return "Notification" in window && window.isSecureContext;
}

async function requestNotificationPermission() {
  if (!canUseBrowserNotifications()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;

  try {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  } catch {
    return false;
  }
}

async function showBrowserNotification(message) {
  if (!canUseBrowserNotifications() || Notification.permission !== "granted") return;

  try {
    const options = {
      body: message,
      icon: "assets/icon-192.png",
      badge: "assets/icon-192.png",
      tag: "buy-buy-buy-reminder",
      renotify: true
    };

    if (serviceWorkerRegistration?.showNotification) {
      await serviceWorkerRegistration.showNotification("買買買提醒", options);
      return;
    }

    new Notification("買買買提醒", options);
  } catch {
    showToast("瀏覽器通知暫時不能使用");
  }
}

function openReminderModal() {
  const remainingItems = activeItems();
  reminderList.innerHTML = "";
  reminderSummary.textContent = remainingItems.length
    ? `還有 ${remainingItems.length} 樣沒買，出發前看一眼。`
    : "目前沒有未買項目，可以安心收工。";

  remainingItems.forEach((item) => {
    const row = document.createElement("li");
    row.textContent = item.text;
    reminderList.append(row);
  });

  reminderModal.hidden = false;
  closeReminderButton.focus();
}

function closeReminderModal() {
  reminderModal.hidden = true;
}

async function setReminder(minutes) {
  const browserNotificationReady = await requestNotificationPermission();
  const message = reminderMessage();
  const dueAt = Date.now() + minutes * 60 * 1000;
  clearTimeout(reminderTimer);
  saveReminder({ dueAt, minutes });
  reminderTimer = setTimeout(() => {
    const latestMessage = reminderMessage();
    showAppAlert("買買買提醒", latestMessage);
    showBrowserNotification(latestMessage);
    clearSavedReminder();
    reminderTimer = null;
  }, minutes * 60 * 1000);
  closeReminderModal();
  showAppAlert("提醒設好了", `${formatReminderLabel(minutes)}後提醒你：${message}`);
  if (!browserNotificationReady) {
    showToast("頁面提醒已開；系統通知要 HTTPS 或安裝成 App 會更穩");
  } else {
    refreshNotificationStatus();
  }
}

function cancelReminder() {
  clearTimeout(reminderTimer);
  reminderTimer = null;
  clearSavedReminder();
  closeReminderModal();
  showToast("已取消定時提醒");
}

function refreshNotificationStatus() {
  if (!canUseBrowserNotifications()) {
    notificationStatus.textContent = "目前這個開啟方式不能用系統通知；放到 HTTPS 或安裝成 App 後會更穩。";
    return;
  }

  if (Notification.permission === "granted") {
    notificationStatus.textContent = "系統通知已開啟。提醒到時會同時跳通知和頁面泡泡。";
    return;
  }

  if (Notification.permission === "denied") {
    notificationStatus.textContent = "系統通知被封鎖了，可以到瀏覽器網站設定裡重新允許。";
    return;
  }

  notificationStatus.textContent = "設定提醒時會詢問是否允許系統通知。";
}

function restoreReminder() {
  const saved = loadSavedReminder();
  if (!saved?.dueAt) return;

  const delay = saved.dueAt - Date.now();
  if (delay <= 0) {
    clearSavedReminder();
    const message = reminderMessage();
    showAppAlert("買買買提醒", message);
    showBrowserNotification(message);
    return;
  }

  clearTimeout(reminderTimer);
  reminderTimer = setTimeout(() => {
    const message = reminderMessage();
    showAppAlert("買買買提醒", message);
    showBrowserNotification(message);
    clearSavedReminder();
    reminderTimer = null;
  }, delay);
}

async function initPwa() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) {
    refreshNotificationStatus();
    return;
  }

  try {
    serviceWorkerRegistration = await navigator.serviceWorker.register("./sw.js");
  } catch {
    showToast("離線安裝暫時沒有啟動");
  }

  refreshNotificationStatus();
}

function initLargeText() {
  const enabled = localStorage.getItem(LARGE_TEXT_KEY) === "true";
  document.body.classList.toggle("large-text", enabled);
  largeTextToggle.setAttribute("aria-pressed", String(enabled));
}

function initVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    voiceButton.disabled = true;
    voiceButton.title = "這個瀏覽器暫時不支援語音輸入";
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "zh-TW";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.addEventListener("start", () => {
    isListening = true;
    voiceButton.classList.add("listening");
    voiceButton.textContent = "停";
    showToast("正在聽，說要買什麼");
  });

  recognition.addEventListener("result", (event) => {
    const transcript = event.results[0][0].transcript;
    addSpokenItems(transcript);
  });

  recognition.addEventListener("end", () => {
    isListening = false;
    voiceButton.classList.remove("listening");
    voiceButton.textContent = "聽";
  });

  recognition.addEventListener("error", () => {
    showToast("語音沒有聽清楚，再試一次");
  });
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  addItem(input.value);
});

clearDoneButton.addEventListener("click", clearDoneItems);

reminderButton.addEventListener("click", openReminderModal);

closeReminderButton.addEventListener("click", closeReminderModal);

cancelReminderButton.addEventListener("click", cancelReminder);

reminderModal.addEventListener("click", (event) => {
  if (event.target === reminderModal) closeReminderModal();
});

document.querySelectorAll("[data-remind-minutes]").forEach((button) => {
  button.addEventListener("click", () => {
    setReminder(Number(button.dataset.remindMinutes));
  });
});

quickForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addQuickItem(quickInput.value);
});

editQuickButton.addEventListener("click", () => {
  const isOpen = quickEditor.hidden;
  quickEditor.hidden = !isOpen;
  editQuickButton.textContent = isOpen ? "完成" : "編輯";
  editQuickButton.setAttribute("aria-expanded", String(isOpen));
  if (isOpen) quickInput.focus();
});

largeTextToggle.addEventListener("click", () => {
  const enabled = !document.body.classList.contains("large-text");
  document.body.classList.toggle("large-text", enabled);
  largeTextToggle.setAttribute("aria-pressed", String(enabled));
  localStorage.setItem(LARGE_TEXT_KEY, String(enabled));
});

voiceButton.addEventListener("click", () => {
  if (!recognition) return;
  if (isListening) {
    recognition.stop();
    return;
  }
  try {
    recognition.start();
  } catch {
    showToast("語音暫時不能啟動，等一下再試");
  }
});

renderQuickItems();
initLargeText();
initVoiceInput();
initPwa();
restoreReminder();
render();
