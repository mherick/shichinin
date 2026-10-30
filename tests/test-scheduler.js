// Scheduler math tests.
const { test, assert, assertEqual, Shichinin } = require('./harness');
const Sch = Shichinin.Scheduler;
const Rng = Shichinin.Rng;

test('levels: HIGH is 3-4 personas; budgets and cadences order correctly', () => {
  const low = Sch.levelConfig('low'), med = Sch.levelConfig('medium'), high = Sch.levelConfig('high');
  assert(high.personas >= 3 && high.personas <= 4, 'HIGH personas in 3-4, got ' + high.personas);
  assert(low.dailyVisitBudget < med.dailyVisitBudget &&
         med.dailyVisitBudget < high.dailyVisitBudget, 'budgets increase with level');
  assert(low.cookieRotationHours > med.cookieRotationHours &&
         med.cookieRotationHours > high.cookieRotationHours, 'rotation gets more aggressive');
  assert(high.maxConcurrentTabs >= med.maxConcurrentTabs, 'concurrency does not shrink');
  assertEqual(Sch.levelConfig('bogus').name, 'high', 'unknown level falls back to high (default)');
});

test('spreadTimes: sorted, inside the active window, gaps respected', () => {
  const rng = Rng.create('spread-test');
  const times = Sch.spreadTimes(10, '2026-10-27', rng, [7, 23], 90);
  assertEqual(times.length, 10);
  const start = new Date('2026-10-27T07:00:00').getTime();
  const end = new Date('2026-10-27T23:00:00').getTime();
  for (let i = 0; i < times.length; i++) {
    assert(times[i] >= start && times[i] < end, 'time inside window');
    if (i > 0) {
      assert(times[i] > times[i - 1], 'strictly increasing');
      assert(times[i] - times[i - 1] >= 89 * 1000, 'min gap ~90s respected');
    }
  }
});

test('spreadTimes: zero count yields no times', () => {
  assertEqual(Sch.spreadTimes(0, '2026-10-27', Rng.create('z')).length, 0);
});

test('scheduleSteps: assigns times + pending status without mutating input', () => {
  const rng = Rng.create('sched-test');
  const raw = [
    { id: 'a', action: 'visit', url: 'https://x.example/' },
    { id: 'b', action: 'search', query: 'q' }
  ];
  const scheduled = Sch.scheduleSteps(raw, '2026-10-27', rng, Sch.levelConfig('high'), [7, 23]);
  assertEqual(scheduled.length, 2);
  for (const s of scheduled) {
    assert(typeof s.scheduledAt === 'number', 'scheduledAt assigned');
    assertEqual(s.status, 'pending');
  }
  assert(!('scheduledAt' in raw[0]), 'input steps not mutated');
});

test('dueSteps / nextPendingStep: only due pending steps are picked', () => {
  const steps = [
    { id: '1', status: 'pending', scheduledAt: 1000 },
    { id: '2', status: 'pending', scheduledAt: 5000 },
    { id: '3', status: 'done', scheduledAt: 1000 },
    { id: '4', status: 'running', scheduledAt: 1000 }
  ];
  const due = Sch.dueSteps(steps, 2000);
  assertEqual(due.length, 1);
  assertEqual(due[0].id, '1');
  assertEqual(Sch.nextPendingStep(steps, 2000).id, '1');
  assertEqual(Sch.nextPendingStep(steps, 500), null);
});

test('budgetRemaining: visits + searches count against the cap', () => {
  const high = Sch.levelConfig('high');
  assertEqual(Sch.budgetRemaining(high, { visits: 10, searches: 0 }), high.dailyVisitBudget - 10);
  assertEqual(Sch.budgetRemaining(high, { visits: 60, searches: 10 }), 0, 'never negative');
  assertEqual(Sch.budgetRemaining(high, {}), high.dailyVisitBudget);
});

test('dateKeyOf: pads month and day', () => {
  assertEqual(Sch.dateKeyOf(new Date(2026, 0, 5)), '2026-01-05');
  assertEqual(Sch.dateKeyOf(new Date(2026, 11, 25)), '2026-12-25');
});

test('settings: pause matching is exact-or-subdomain, and defaults protect banks', () => {
  const Settings = Shichinin.Settings;
  const paused = Settings.DEFAULTS.pausedSites;
  assert(Settings.isHostPaused('chase.com', paused));
  assert(Settings.isHostPaused('www.chase.com', paused), 'www prefix normalized');
  assert(Settings.isHostPaused('secure.bankofamerica.com', paused), 'subdomain matches');
  assert(!Settings.isHostPaused('notchase.com', paused), 'suffix lookalike does not match');
  assert(!Settings.isHostPaused('example.com', paused));
  assert(!Settings.isHostPaused('', paused));
});

test('settings: merge keeps defaults for missing keys', () => {
  const Settings = Shichinin.Settings;
  const merged = Settings.merge({ paused: true });
  assertEqual(merged.paused, true);
  assertEqual(merged.aggressiveness, 'high', 'default aggressiveness is high');
  assertEqual(merged.safeMode, true, 'safe mode defaults on');
  assertEqual(merged.loggedInPollution, false, 'logged-in pollution defaults off');
});
