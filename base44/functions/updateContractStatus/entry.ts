import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { contract_id, action } = body;

    if (!contract_id || !action) {
      return Response.json({ error: 'Missing contract_id or action' }, { status: 400 });
    }

    const contracts = await base44.entities.Contract.filter({ id: contract_id });
    if (!contracts.length) return Response.json({ error: 'Contract not found' }, { status: 404 });

    const contract = contracts[0];

    if (action === 'approve') {
      await base44.entities.Contract.update(contract_id, {
        status: 'godkjent',
        approved_by_worker_id: user.id,
        approved_at: new Date().toISOString()
      });
      return Response.json({ status: 'approved', contract_id });
    } else if (action === 'reject') {
      await base44.entities.Contract.update(contract_id, {
        status: 'avvist'
      });
      return Response.json({ status: 'rejected', contract_id });
    } else if (action === 'send') {
      await base44.entities.Contract.update(contract_id, {
        status: 'sendt'
      });
      return Response.json({ status: 'sent', contract_id });
    } else {
      return Response.json({ error: 'Invalid action. Use: approve, reject, send' }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});