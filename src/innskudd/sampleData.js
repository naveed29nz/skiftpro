import { addDaysIso, todayIso } from './model.js';

export function sampleInnskudd(today = todayIso()) {
  const teams = [
    { key: 'team1', label: 'N.417', kundenr: '20052971' },
    { key: 'team2', label: 'N.500', kundenr: '20048196' },
    { key: 'team3', label: 'N.586', kundenr: '20057557' },
    { key: 'team4', label: 'N.897', kundenr: '20057456' },
  ];
  const registrations = [
    bag('a1', 'team1', '101522502', addDaysIso(today, -4), 'Sofian Zafar', 15115, { seddel_1000_antall: 10, seddel_500_antall: 8, seddel_200_antall: 5, seddel_100_antall: 1, mynt_belop: 15 }),
    bag('a2', 'team1', '101522499', addDaysIso(today, -3), 'Sofian Zafar', 2800, { seddel_500_antall: 5, seddel_200_antall: 1, seddel_100_antall: 1, mynt_belop: 0 }),
    bag('a3', 'team1', '101522489', addDaysIso(today, -8), 'Ali Raza', 7300, { seddel_1000_antall: 7, seddel_100_antall: 3 }),
    bag('a4', 'team1', '101522469', addDaysIso(today, -9), 'Ali Raza', 2760, { seddel_1000_antall: 2, seddel_500_antall: 1, seddel_200_antall: 1, seddel_100_antall: 0, mynt_belop: 60 }),
    bag('a5', 'team2', '101555869', addDaysIso(today, -10), 'Munawar Ali', 31292, { seddel_1000_antall: 30, seddel_500_antall: 2, mynt_belop: 292 }),
    bag('a6', 'team4', '101549250', addDaysIso(today, -7), 'Hamza Khan', 18440, { seddel_1000_antall: 18, seddel_100_antall: 4, mynt_belop: 40 }),
    bag('a7', 'team4', '101498317', addDaysIso(today, -21), 'Hamza Khan', 21050, { seddel_1000_antall: 21, mynt_belop: 50 }),
    bag('a8', 'team3', '101665981', addDaysIso(today, -2), 'Sara Moen', 12480, { seddel_1000_antall: 12, seddel_200_antall: 2, mynt_belop: 80 }),
  ];
  const deposits = [
    deposit('d2', '2002', '20052971', '101522499', 'Synkronisert', null, addDaysIso(today, -2)),
    deposit('d3', '2003', '20052971', '101522489', 'Bokført', 7300, addDaysIso(today, -6)),
    deposit('d4', '2004', '20052971', '101522469', 'Bokført', 2560, addDaysIso(today, -7)),
    deposit('d5', '2005', '20048196', '101555869', 'Bokført', 31292, addDaysIso(today, -8)),
    deposit('d8', '2008', '20057557', '101665981', 'Synkronisert', null, addDaysIso(today, -1)),
    deposit('d9', '2009', '20057557', '101665994', 'Bokført', 9870, addDaysIso(today, -1)),
  ];
  return { teams, registrations, deposits };
}

function bag(id, team, posenummer, dato, registrert_navn, belop, counts) {
  return {
    id,
    team,
    posenummer,
    dato,
    registrert_navn,
    belop,
    ansatt_id: registrert_navn === 'Sofian Zafar' ? 'w-sofian' : 'w-other',
    created_by: 'user-sofian',
    seddel_1000_antall: counts.seddel_1000_antall || 0,
    seddel_500_antall: counts.seddel_500_antall || 0,
    seddel_200_antall: counts.seddel_200_antall || 0,
    seddel_100_antall: counts.seddel_100_antall || 0,
    mynt_belop: counts.mynt_belop || 0,
    antall_sedler: (counts.seddel_1000_antall || 0) + (counts.seddel_500_antall || 0) + (counts.seddel_200_antall || 0) + (counts.seddel_100_antall || 0),
  };
}

function deposit(id, innskuddnr, kundenr, bilagsnr, status, total, telledato) {
  return { id, innskuddnr, kundenr, bilagsnr, status, total, telledato, team: null };
}
