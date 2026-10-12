import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const dayOfWeek = today.getDay(); // 0=Sunday ... 6=Saturday

    // Get all active recurring tasks
    const recurringTasks = await base44.asServiceRole.entities.RecurringTask.filter({ is_active: true });

    let created = 0;
    for (const rt of recurringTasks) {
      let shouldCreate = false;

      if (rt.recurrence === 'daily') {
        shouldCreate = true;
      } else if (rt.recurrence === 'weekly') {
        shouldCreate = rt.day_of_week === dayOfWeek;
      } else if (rt.recurrence === 'biweekly') {
        // Check if today is the right day of week AND it's an even week number
        const weekNumber = Math.floor((today - new Date(today.getFullYear(), 0, 1)) / (7 * 24 * 60 * 60 * 1000));
        shouldCreate = rt.day_of_week === dayOfWeek && weekNumber % 2 === 0;
      } else if (rt.recurrence === 'monthly') {
        // Create on the 1st of each month
        shouldCreate = today.getDate() === 1;
      }

      if (!shouldCreate) continue;

      // Avoid duplicate: check if a task with this title already exists today
      const existing = await base44.asServiceRole.entities.Task.filter({
        title: rt.title,
        due_date: todayStr,
        org_id: rt.org_id || '',
      });
      if (existing.length > 0) continue;

      await base44.asServiceRole.entities.Task.create({
        org_id: rt.org_id || '',
        title: rt.title,
        description: rt.description || '',
        team: rt.team || '',
        assigned_worker_id: rt.assigned_worker_ids?.includes('all') ? 'all' : (rt.assigned_worker_ids?.[0] || ''),
        assigned_worker_name: rt.assigned_worker_names?.[0] || '',
        assigned_worker_ids: rt.assigned_worker_ids || [],
        assigned_worker_names: rt.assigned_worker_names || [],
        priority: rt.priority || 'normal',
        due_date: todayStr,
        status: 'open',
        image_url: rt.image_url || '',
      });
      created++;
    }

    return Response.json({ ok: true, created });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}