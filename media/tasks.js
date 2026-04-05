import { vscodeStateApi } from './state.js';

const TASK_AGENTS = {
  codex: { label: 'Codex' },
  claude: { label: 'Claude' },
  copilot: { label: 'Copilot' },
  gemini: { label: 'Gemini' },
};

const TASK_STATUSES = {
  waiting: { label: 'Waiting' },
  'in-progress': { label: 'In Progress' },
  done: { label: 'Done' },
  blocked: { label: 'Blocked' },
};

const TASK_STATUS_ORDER = ['waiting', 'in-progress', 'done', 'blocked'];
const VALID_TASK_AGENTS = Object.keys(TASK_AGENTS);
const VALID_TASK_STATUSES = Object.keys(TASK_STATUSES);

const taskState = {
  selectedAgent: 'codex',
  selectedStatus: 'waiting',
  tasks: [],
};

let saveState = () => {};
const taskEls = {};

function $(selector) {
  return document.querySelector(selector);
}

function $$(selector) {
  return Array.from(document.querySelectorAll(selector));
}

function getAgentOptionMarkup(agent) {
  const selectedButton = document.querySelector(`.agent-btn[data-agent="${agent}"] .option-main`);
  if (selectedButton) return selectedButton.innerHTML;
  return `<span>${TASK_AGENTS[agent]?.label || agent}</span>`;
}

export function sanitizeTaskList(rawTasks) {
  if (!Array.isArray(rawTasks)) return [];
  return rawTasks
    .filter((task) => task && typeof task === 'object' && typeof task.text === 'string')
    .map((task) => {
      const id = typeof task.id === 'string' && task.id.length > 0
        ? task.id
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const agent = VALID_TASK_AGENTS.includes(task.agent) ? task.agent : 'codex';
      const status = VALID_TASK_STATUSES.includes(task.status) ? task.status : 'waiting';
      const text = task.text.trim().slice(0, 140);
      return { id, agent, status, text };
    })
    .filter((task) => task.text.length > 0)
    .slice(0, 100);
}

function renderOnboarding() {
  const onboarding = $('#taskOnboarding');
  if (!onboarding) return;
  onboarding.classList.toggle('hidden', taskState.tasks.length > 0);
}

function renderTasks() {
  if (!taskEls.tasksList || !taskEls.tasksCount) return;
  taskEls.tasksCount.textContent = String(taskState.tasks.length);
  taskEls.tasksList.innerHTML = '';

  if (taskState.tasks.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'tasks-empty';
    empty.textContent = 'No tasks yet.';
    taskEls.tasksList.appendChild(empty);
    renderOnboarding();
    return;
  }

  taskState.tasks.forEach((task) => {
    const item = document.createElement('article');
    item.className = 'task-item';

    const title = document.createElement('p');
    title.className = 'task-item-title';
    title.textContent = task.text;

    const meta = document.createElement('div');
    meta.className = 'task-item-meta';

    const agentChip = document.createElement('span');
    agentChip.className = 'task-agent-chip';
    agentChip.innerHTML = getAgentOptionMarkup(task.agent);

    const statusChip = document.createElement('button');
    statusChip.type = 'button';
    statusChip.className = 'task-status-chip task-status-btn';
    statusChip.dataset.action = 'cycle-status';
    statusChip.dataset.taskId = task.id;
    statusChip.setAttribute('aria-label', `Change status for task: ${task.text}`);
    statusChip.title = 'Change status';
    const statusDot = document.createElement('span');
    statusDot.className = `status-dot status-${task.status}`;
    const statusText = document.createElement('span');
    statusText.textContent = TASK_STATUSES[task.status]?.label || task.status;
    statusChip.append(statusDot, statusText);

    const actions = document.createElement('div');
    actions.className = 'task-item-actions';

    const archiveBtn = document.createElement('button');
    archiveBtn.type = 'button';
    archiveBtn.className = 'task-action-btn task-archive-btn';
    archiveBtn.dataset.action = 'archive-task';
    archiveBtn.dataset.taskId = task.id;
    archiveBtn.title = 'Archive task';
    archiveBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8v13H3V8"/><rect x="1" y="3" width="22" height="5" rx="1"/><path d="M10 12h4"/></svg>';

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'task-action-btn task-delete-btn';
    deleteBtn.dataset.action = 'delete-task';
    deleteBtn.dataset.taskId = task.id;
    deleteBtn.title = 'Delete task';
    deleteBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>';

    actions.append(archiveBtn, deleteBtn);
    meta.append(agentChip, statusChip);
    item.append(title, meta, actions);
    taskEls.tasksList.appendChild(item);
  });

  renderOnboarding();
}

function loadArchivedTasks() {
  try {
    return JSON.parse(localStorage.getItem('focus-flow-archived-tasks') || '[]');
  } catch (e) {
    return [];
  }
}

function saveArchivedTasks(archived) {
  try {
    localStorage.setItem('focus-flow-archived-tasks', JSON.stringify(archived));
  } catch (e) {
    // ignore
  }
  if (vscodeStateApi) {
    try {
      vscodeStateApi.postMessage({ type: 'focusFlow/archiveTasks', payload: archived });
    } catch (e) {
      // ignore
    }
  }
}

function archiveTask(taskId) {
  const idx = taskState.tasks.findIndex((task) => task.id === taskId);
  if (idx < 0) return;
  const [task] = taskState.tasks.splice(idx, 1);
  const archived = loadArchivedTasks();
  archived.unshift({ ...task, archivedAt: Date.now() });
  saveArchivedTasks(archived);
  renderTasks();
  saveState();
}

function deleteTask(taskId) {
  const idx = taskState.tasks.findIndex((task) => task.id === taskId);
  if (idx < 0) return;
  taskState.tasks.splice(idx, 1);
  renderTasks();
  saveState();
}

function addTask(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return;
  taskState.tasks.unshift({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    text: trimmed,
    agent: taskState.selectedAgent,
    status: taskState.selectedStatus,
  });
  if (taskEls.taskInput) taskEls.taskInput.value = '';
  renderTasks();
  saveState();
}

export function addTaskFromQuickCapture(text) {
  addTask(text);
}

function updateTaskStatus(taskId, nextStatus) {
  const task = taskState.tasks.find((item) => item.id === taskId);
  if (!task) return;
  task.status = nextStatus;
  renderTasks();
  saveState();
}

function bindTaskEvents() {
  taskEls.agentButtons.forEach((button) => {
    button.addEventListener('click', () => {
      taskState.selectedAgent = button.dataset.agent;
      syncTaskButtonSelection();
      saveState();
    });
  });

  taskEls.statusButtons.forEach((button) => {
    button.addEventListener('click', () => {
      taskState.selectedStatus = button.dataset.status;
      syncTaskButtonSelection();
      saveState();
    });
  });

  taskEls.btnAddTask?.addEventListener('click', () => {
    addTask(taskEls.taskInput?.value);
  });

  taskEls.taskInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTask(taskEls.taskInput.value);
    }
  });

  taskEls.tasksList?.addEventListener('click', (event) => {
    const statusBtn = event.target.closest('[data-action="cycle-status"]');
    if (statusBtn) {
      const taskId = statusBtn.dataset.taskId;
      const task = taskState.tasks.find((item) => item.id === taskId);
      if (task) updateTaskStatus(taskId, TASK_STATUS_ORDER[(TASK_STATUS_ORDER.indexOf(task.status) + 1) % TASK_STATUS_ORDER.length]);
      return;
    }
    const archiveBtn = event.target.closest('[data-action="archive-task"]');
    if (archiveBtn) {
      archiveTask(archiveBtn.dataset.taskId);
      return;
    }
    const deleteBtn = event.target.closest('[data-action="delete-task"]');
    if (deleteBtn) deleteTask(deleteBtn.dataset.taskId);
  });
}

function cacheTaskEls() {
  taskEls.taskInput = $('#taskInput');
  taskEls.btnAddTask = $('#btnAddTask');
  taskEls.tasksList = $('#tasksList');
  taskEls.tasksCount = $('#tasksCount');
  taskEls.agentButtons = $$('.agent-btn');
  taskEls.statusButtons = $$('.status-btn');
}

export function getTaskSnapshot() {
  return {
    selectedAgent: taskState.selectedAgent,
    selectedStatus: taskState.selectedStatus,
    tasks: taskState.tasks.map((task) => ({ ...task })),
  };
}

export function initTasks(bootTasks, callbacks) {
  saveState = callbacks?.saveState || (() => {});
  cacheTaskEls();
  taskState.selectedAgent = typeof bootTasks?.selectedAgent === 'string' ? bootTasks.selectedAgent : 'codex';
  taskState.selectedStatus = typeof bootTasks?.selectedStatus === 'string' ? bootTasks.selectedStatus : 'waiting';
  taskState.tasks = sanitizeTaskList(bootTasks?.tasks);
  syncTaskButtonSelection();
  bindTaskEvents();
  renderTasks();
}
