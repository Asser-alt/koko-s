const STORAGE_KEY = "clients-data";
const months = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];
const filters = [
  "فلتر 1",
  "فلتر 2",
  "فلتر 3",
  "فلتر 4",
  "فلتر 5",
  "فلتر 6",
  "فلتر 7",
];
const filterIntervals = [3, 6, 6, 12, 12, 12, 12];
let detailsClockInterval = null;

function normalizeClient(client) {
  return {
    id: client.id || crypto.randomUUID(),
    name: client.name || "",
    address: client.address || "",
    phone: client.phone || "",
    filter: client.filter ?? 0,
    startDate: client.startDate || null,
    notes: client.notes || "",
    renewalDates: client.renewalDates || {},
    schedule: client.schedule || {},
    createdAt: client.createdAt || new Date().toISOString(),
  };
}

function loadClients() {
  try {
    return (JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") || []).map(
      normalizeClient,
    );
  } catch {
    return [];
  }
}

function saveClients(clients) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(clients));
}

function parseDate(value) {
  if (!value) return new Date();
  if (value instanceof Date) return new Date(value);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(value);
}

function formatDate(date) {
  const value = parseDate(date);
  const day = String(value.getDate()).padStart(2, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const year = value.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatDateTime(date) {
  const value = new Date(date);
  const day = String(value.getDate()).padStart(2, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const year = value.getFullYear();
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  const seconds = String(value.getSeconds()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

function toDateInputValue(date) {
  const value = parseDate(date);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addMonths(date, amount) {
  const value = parseDate(date);
  const targetMonth = value.getMonth() + amount;
  value.setFullYear(
    value.getFullYear() + Math.floor(targetMonth / 12),
    targetMonth % 12,
    value.getDate(),
  );
  return value;
}

function getClientBaseDate(client) {
  if (client.startDate) {
    return parseDate(client.startDate);
  }
  return new Date();
}

// --- Web Push client helpers ---
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function initPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    console.warn("Push not supported in this browser.");
    return;
  }

  try {
    const reg = await navigator.serviceWorker.register("sw.js");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.warn("Notification permission not granted.");
      return;
    }

    const resp = await fetch("/vapidPublicKey");
    if (!resp.ok) {
      console.warn("Could not fetch VAPID public key from server.");
      return;
    }
    const vapidPublicKey = await resp.text();
    const convertedKey = urlBase64ToUint8Array(vapidPublicKey.trim());

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedKey,
    });

    await fetch("/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub),
    });

    console.log("Push subscription successful");
  } catch (err) {
    console.error("Push subscription failed", err);
  }
}

function updateCurrentDateLabel() {
  const element = document.getElementById("currentDateLabel");
  if (!element) return;
  element.textContent = `التاريخ والوقت الحالي: ${formatDateTime(new Date())}`;
}

function setFilterRenewalDate(client, filterIndex, active) {
  if (!client.renewalDates) {
    client.renewalDates = {};
  }

  const interval = filterIntervals[filterIndex] || 12;

  if (!active) {
    delete client.renewalDates[filterIndex];
    return null;
  }

  // أول تفعيل
  if (!client.renewalDates[filterIndex]) {
    const firstDate = addMonths(getClientBaseDate(client), interval);
    client.renewalDates[filterIndex] = toDateInputValue(firstDate);
    return firstDate;
  }

  // بعد تغيير الفلتر يضيف دورة جديدة
  const nextDate = addMonths(
    parseDate(client.renewalDates[filterIndex]),
    interval,
  );

  client.renewalDates[filterIndex] = toDateInputValue(nextDate);

  return nextDate;
}

function completeFilterRenewal(clientId, filterIndex) {
  const clients = loadClients();

  const client = clients.find((c) => c.id === clientId);

  if (!client) return;

  const interval = filterIntervals[filterIndex] || 12;

  const currentDate = parseDate(client.renewalDates[filterIndex]);

  const nextDate = addMonths(currentDate, interval);

  client.renewalDates[filterIndex] = toDateInputValue(nextDate);

  saveClients(clients);

  renderDetailsPage();

  updateHomeReminderBanner();
}

function getFilterStatus(client, filterIndex) {
  const hasRenewal = Boolean(client.renewalDates?.[filterIndex]);
  if (!hasRenewal) {
    return { active: false, due: false, nextDueDate: null };
  }

  const interval = filterIntervals[filterIndex] || 12;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let nextDueDate = parseDate(client.renewalDates[filterIndex]);
  nextDueDate.setHours(0, 0, 0, 0);

  while (nextDueDate < today) {
    nextDueDate = addMonths(nextDueDate, interval);
  }

  client.renewalDates[filterIndex] = toDateInputValue(nextDueDate);

  return {
    active: true,
    due: today.getTime() === nextDueDate.getTime(),
    nextDueDate,
  };
}

function updateHomeReminderBanner() {
  const banner = document.getElementById("homeReminderBanner");
  if (!banner) return;

  const clients = loadClients();
  let hasChanges = false;
  const reminders = clients.flatMap((client) =>
    filters.flatMap((_, filterIndex) => {
      if (!client.renewalDates?.[filterIndex]) return [];

      const status = getFilterStatus(client, filterIndex);
      if (!status.active || !status.due) return [];

      hasChanges = true;
      return [
        `<div>• ${client.name} | ${filters[filterIndex]} | مستحق اليوم</div>`,
      ];
    }),
  );

  if (hasChanges) {
    saveClients(clients);
  }

  if (!reminders.length) {
    banner.classList.add("hidden");
    banner.innerHTML = "";
    return;
  }

  banner.classList.remove("hidden");
  banner.innerHTML = `<strong>تنبيهات:</strong><br />${reminders.join("")}`;
}

function renderClients() {
  const list = document.getElementById("clientsList");
  const searchBox = document.getElementById("clientSearch");
  if (!list) return;

  const clients = loadClients();
  const query = (searchBox?.value || "").trim().toLowerCase();
  const filteredClients = clients.filter((client) =>
    client.name.toLowerCase().includes(query),
  );

  if (!filteredClients.length) {
    list.innerHTML = '<p class="empty-state">لا يوجد عملاء مطابقين للبحث.</p>';
    updateHomeReminderBanner();
    return;
  }

  list.innerHTML = "";
  filteredClients.forEach((client) => {
    const wrapper = document.createElement("div");
    wrapper.className = "client-card";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "client-card";
    button.innerHTML = `
      <span>
        <strong>${client.name}</strong>
        <small>${client.phone || "لا يوجد رقم"}</small>
      </span>
      <span>فتح التفاصيل</span>
    `;
    button.addEventListener("click", () => {
      window.location.href = `client.html?id=${client.id}`;
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "delete-btn";
    deleteBtn.textContent = "حذف";
    deleteBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      const remainingClients = loadClients().filter(
        (item) => item.id !== client.id,
      );
      saveClients(remainingClients);
      renderClients();
    });

    wrapper.appendChild(button);
    wrapper.appendChild(deleteBtn);
    list.appendChild(wrapper);
  });

  updateHomeReminderBanner();
}

function setupHomePage() {
  const addBtn = document.getElementById("addClientBtn");
  const panel = document.getElementById("clientFormPanel");
  const cancelBtn = document.getElementById("cancelFormBtn");
  const form = document.getElementById("clientForm");
  const searchBox = document.getElementById("clientSearch");

  if (!addBtn || !panel || !cancelBtn || !form) return;

  addBtn.addEventListener("click", () => {
    panel.classList.remove("hidden");
    form.querySelector('input[name="name"]').focus();
  });

  cancelBtn.addEventListener("click", () => {
    panel.classList.add("hidden");
    form.reset();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const client = normalizeClient({
      id: crypto.randomUUID(),
      name: data.get("name").toString().trim(),
      address: data.get("address").toString().trim(),
      phone: data.get("phone").toString().trim(),
      filter: Number(data.get("filter") || 0),
      startDate: data.get("startDate")?.toString() || null,
      createdAt: new Date().toISOString(),
    });

    if (!client.name) return;

    const clients = loadClients();
    clients.push(client);
    saveClients(clients);
    form.reset();
    panel.classList.add("hidden");
    renderClients();
  });

  if (searchBox) {
    searchBox.addEventListener("input", renderClients);
  }

  renderClients();
  setInterval(updateHomeReminderBanner, 1000);

  // Prompt user to enable push notifications (optional)
  if ("serviceWorker" in navigator && "PushManager" in window) {
    try {
      const enable = window.confirm(
        "هل تريد تفعيل إشعارات التذكير حتى لو المتصفح مقفول؟",
      );
      if (enable) initPush().catch(console.error);
    } catch (e) {
      /* ignore */
    }
  }
}

function bindFilterButtons(client) {
  document.querySelectorAll(".toggle-filter-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const filterIndex = Number(button.dataset.filter);

      const clients = loadClients();

      const target = clients.find((c) => c.id === client.id);

      if (!target) return;

      const status = getFilterStatus(target, filterIndex);

      if (!status.active) {
        setFilterRenewalDate(target, filterIndex, true);

        saveClients(clients);

        renderDetailsPage();

        updateHomeReminderBanner();

        return;
      }

      if (status.due) {
        completeFilterRenewal(client.id, filterIndex);
      }
    });
  });
}

function renderDetailsPage() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const clients = loadClients();
  const client = clients.find((item) => item.id === id);
  const container = document.getElementById("clientDetails");
  if (!container) return;

  if (!client) {
    container.innerHTML = `
      <p class="empty-state">لم يتم العثور على هذا العميل.</p>
      <a class="back-link" href="index.html">العودة إلى الصفحة الرئيسية</a>
    `;
    return;
  }

  filters.forEach((_, filterIndex) => {
    if (client.renewalDates?.[filterIndex]) {
      getFilterStatus(client, filterIndex);
    }
  });

  if (client.renewalDates && Object.keys(client.renewalDates).length) {
    saveClients(clients);
  }

  container.innerHTML = `
    <div class="details-layout">
      <section class="details-card">
        <a class="back-link" href="index.html">← العودة</a>
        <h2>${client.name}</h2>
        <div id="currentDateLabel" class="current-date-label"></div>
        <div class="detail-grid">
          <div><strong>العنوان:</strong> ${client.address || "غير محدد"}</div>
          <div><strong>رقم الهاتف:</strong> ${client.phone || "غير محدد"}</div>
          <div><strong>الفلتر:</strong> ${filters[client.filter ?? 0] || "غير محدد"}</div>
          <div><strong>التاريخ:</strong> ${client.startDate ? formatDate(client.startDate) : "غير محدد"}</div>
        </div>
      </section>

      <section class="table-card">
        <h3>الفلترات</h3>
        <p>كل فلتر له خلية واحدة. عند التفعيل يتم حساب التاريخ القادم من التاريخ المدخل في العميل.</p>
        <div class="filters-list">
          ${filters
            .map((filter, filterIndex) => {
              const status = getFilterStatus(client, filterIndex);
              return `
                <div class="filter-item">
                  <div>
                    <strong>${filter}</strong>
                    <div class="filter-meta">
                      ${
                        status.active
                          ? status.due
                            ? "مستحق اليوم"
                            : `التاريخ القادم: ${formatDate(status.nextDueDate)}`
                          : "غير مفعل"
                      }
                    </div>
                  </div>
                  <button type="button" class="toggle-filter-btn ${status.active ? "active" : ""}" data-filter="${filterIndex}">
                    ${
                      status.active
                        ? status.due
                          ? "تم تغيير الفلتر"
                          : "مفعل"
                        : "تفعيل"
                    }
                  </button>
                </div>
              `;
            })
            .join("")}
        </div>

        <label>
          الملاحظات
          <textarea id="clientNotes" class="notes-box" placeholder="اكتب ملاحظاتك هنا...">${client.notes || ""}</textarea>
        </label>
      </section>
    </div>
  `;

  bindFilterButtons(client);
  updateCurrentDateLabel();
  if (detailsClockInterval) {
    clearInterval(detailsClockInterval);
  }
  detailsClockInterval = setInterval(updateCurrentDateLabel, 1000);

  const notesField = document.getElementById("clientNotes");
  if (notesField) {
    notesField.addEventListener("input", () => {
      const clients = loadClients();
      const targetClient = clients.find((item) => item.id === client.id);
      if (!targetClient) return;
      targetClient.notes = notesField.value;
      saveClients(clients);
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;
  if (page === "home") {
    setupHomePage();
  } else if (page === "details") {
    renderDetailsPage();
  }
});
