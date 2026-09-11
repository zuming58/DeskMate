export function workbenchTime(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '尚无记录';
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function workbenchProjects(tasks = []) {
  const groups = new Map();
  const priority = { error: 6, waiting: 5, working: 4, thinking: 3, completed: 2, idle: 1 };
  for (const task of tasks) {
    const label = String(task.taskLabel || '未标注项目').slice(0, 60);
    const group = groups.get(label) || { label, count: 0, state: 'idle', receivedAt: 0 };
    group.count += 1;
    if ((priority[task.state] || 0) > priority[group.state]) group.state = task.state;
    group.receivedAt = Math.max(group.receivedAt, Number(task.receivedAt) || 0);
    groups.set(label, group);
  }
  return [...groups.values()].sort((a, b) => priority[b.state] - priority[a.state] || b.receivedAt - a.receivedAt);
}

export function workbenchSchedule(policy, latest, now = new Date()) {
  if (!policy) return '状态待读取';
  if (!policy.sourcesEnabled) return '已暂停整理';
  if (policy.running) return '正在整理';
  if (policy.schedule !== 'daily') return '手动整理';
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (latest?.status === 'completed' && latest.day === today) return '今天已完成';
  return `每天 ${policy.dailyTime || '23:30'}`;
}
