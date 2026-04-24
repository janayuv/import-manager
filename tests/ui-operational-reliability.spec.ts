import { expect, test, type Page } from '@playwright/test';

import {
  reloadPlaywrightPageForStubHydrate,
  resetPlaywrightDatabase,
  waitForPlaywrightInvoke,
} from './playwright-helpers';

const defaultUser = process.env.E2E_USERNAME ?? 'Jana';
const defaultPassword = process.env.E2E_PASSWORD ?? 'inzi@123$%';

function appContent(page: Page) {
  return page.locator('main.flex-1.overflow-y-auto');
}

async function login(page: Page) {
  await page.goto('/login');
  await waitForPlaywrightInvoke(page);
  await resetPlaywrightDatabase(page);
  await reloadPlaywrightPageForStubHydrate(page);
  await page.locator('#username').fill(defaultUser);
  await page.locator('#password').fill(defaultPassword);
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page).toHaveURL('/');
  await expect(
    appContent(page).getByText('Operational overview across modules')
  ).toBeVisible({ timeout: 30_000 });
}

async function pwInvoke<T = unknown>(
  page: Page,
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  return page.evaluate(
    async ({ c, a }) => {
      const inv = (
        window as unknown as {
          __IMPORT_MANAGER_PLAYWRIGHT_INVOKE__: (
            command: string,
            payload?: Record<string, unknown>
          ) => Promise<unknown>;
        }
      ).__IMPORT_MANAGER_PLAYWRIGHT_INVOKE__;
      return inv(c, a) as T;
    },
    { c: cmd, a: args ?? {} }
  );
}

async function gotoAutomationRules(page: Page) {
  await page.waitForFunction(
    () => localStorage.getItem('currentUser') != null,
    { timeout: 15_000 }
  );
  await page.goto('/admin/automation-rules');
  await waitForPlaywrightInvoke(page);
  await expect(page).toHaveURL(/\/admin\/automation-rules/);
  await expect(
    appContent(page).getByText('Job operations control', { exact: false })
  ).toBeVisible({ timeout: 45_000 });
}

test.describe.configure({ mode: 'serial', timeout: 120_000 });

test.describe('Operational reliability (Playwright stub)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('job enable / disable updates registry badges', async ({ page }) => {
    await gotoAutomationRules(page);
    const jobOpsCard = appContent(page).locator('[data-slot="card"]', {
      hasText: 'Job operations control',
    });
    const row = jobOpsCard.locator('tbody tr').filter({
      hasText: 'automation_cycle',
    });
    await expect(row.getByText('ACTIVE', { exact: true })).toBeVisible();
    await row.getByRole('switch').click();
    await expect(row.getByText('DISABLED')).toBeVisible();
    await row.getByRole('switch').click();
    await expect(row.getByText('ACTIVE')).toBeVisible();

    const snap = await pwInvoke<{
      jobs: Array<{ jobId: string; isEnabled: number }>;
    }>(page, 'playwright_operational_stub_command', { action: 'snapshot' });
    const j = snap.jobs.find(x => x.jobId === 'automation_cycle');
    expect(j?.isEnabled).toBe(1);
  });

  test('manual retry creates SUCCESS row and increments retry count', async ({
    page,
  }) => {
    await gotoAutomationRules(page);
    const jobOpsCard = appContent(page).locator('[data-slot="card"]', {
      hasText: 'Job operations control',
    });
    await jobOpsCard.getByPlaceholder(/uuid/i).fill('exec-failed-pw');
    await jobOpsCard.getByRole('button', { name: 'Retry job' }).click();
    await expect(
      page.locator('[data-sonner-toast][data-type="success"]')
    ).toBeVisible({ timeout: 10_000 });

    const rows = await pwInvoke<
      Array<{ status: string; retryCount: number; executionId: string }>
    >(page, 'list_workflow_job_execution_log_command', {
      callerRole: 'admin',
      jobId: 'automation_cycle',
      limit: 20,
    });
    const success = rows.filter(r => r.status === 'SUCCESS');
    expect(success.length).toBeGreaterThanOrEqual(1);
    const top = success[0];
    expect(top.retryCount).toBeGreaterThanOrEqual(1);
  });

  test('reset schedule anchor clears pending missed alerts for job', async ({
    page,
  }) => {
    await gotoAutomationRules(page);
    await appContent(page)
      .getByRole('button', { name: 'Scan for missed runs' })
      .click();
    await expect(
      page
        .locator('[data-sonner-toast][data-type="success"]')
        .filter({ hasText: /Missed-run scan/i })
    ).toBeVisible({ timeout: 10_000 });
    await appContent(page)
      .getByRole('button', { name: 'Reset schedule anchor' })
      .click();
    await expect(
      page
        .locator('[data-sonner-toast][data-type="success"]')
        .filter({ hasText: /Schedule anchor reset/i })
    ).toBeVisible({ timeout: 10_000 });

    const missed = await pwInvoke<Array<{ jobId: string; status: string }>>(
      page,
      'list_workflow_job_missed_alerts_command',
      {
        callerRole: 'admin',
        limit: 50,
      }
    );
    expect(
      missed.some(m => m.jobId === 'automation_cycle' && m.status === 'PENDING')
    ).toBe(false);
  });

  test('missed-run scan inserts pending alert and execution', async ({
    page,
  }) => {
    await resetPlaywrightDatabase(page);
    await reloadPlaywrightPageForStubHydrate(page);
    await page.goto('/login');
    await waitForPlaywrightInvoke(page);
    await page.locator('#username').fill(defaultUser);
    await page.locator('#password').fill(defaultPassword);
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page).toHaveURL('/');

    await gotoAutomationRules(page);
    await appContent(page)
      .getByRole('button', { name: 'Scan for missed runs' })
      .click();
    await expect(
      page.locator('[data-sonner-toast][data-type="success"]')
    ).toBeVisible({ timeout: 10_000 });

    const dash = await pwInvoke<{ pendingMissed: number }>(
      page,
      'get_missed_schedule_dashboard_command',
      { callerRole: 'admin' }
    );
    expect(dash.pendingMissed).toBeGreaterThanOrEqual(1);
  });

  test('recover missed job writes recovery log and SUCCESS execution', async ({
    page,
  }) => {
    await resetPlaywrightDatabase(page);
    await reloadPlaywrightPageForStubHydrate(page);
    await page.goto('/login');
    await waitForPlaywrightInvoke(page);
    await page.locator('#username').fill(defaultUser);
    await page.locator('#password').fill(defaultPassword);
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page).toHaveURL('/');

    await gotoAutomationRules(page);
    await appContent(page)
      .getByRole('button', { name: 'Scan for missed runs' })
      .click();
    await expect(
      page
        .locator('[data-sonner-toast][data-type="success"]')
        .filter({ hasText: /Missed-run scan/i })
    ).toBeVisible({ timeout: 10_000 });
    await appContent(page)
      .getByRole('button', { name: 'Recover missed job' })
      .click();
    await expect(
      page
        .locator('[data-sonner-toast][data-type="success"]')
        .filter({ hasText: /recovered:/i })
    ).toBeVisible({ timeout: 10_000 });

    const csv = await pwInvoke<string>(
      page,
      'export_workflow_job_recovery_log_csv_command',
      { callerRole: 'admin' }
    );
    expect(csv).toContain('recovery_id,job_id');
    expect(csv.split('\n').length).toBeGreaterThan(1);

    const execRows = await pwInvoke<Array<{ status: string }>>(
      page,
      'list_workflow_job_execution_log_command',
      { callerRole: 'admin', jobId: null, limit: 80 }
    );
    expect(execRows.some(r => r.status === 'SUCCESS')).toBe(true);
  });

  test('recovery guard stop then admin override re-enables and logs', async ({
    page,
  }) => {
    await gotoAutomationRules(page);
    await pwInvoke(page, 'playwright_operational_stub_command', {
      action: 'guard_stop',
      jobId: 'automation_cycle',
    });
    await appContent(page)
      .getByRole('button', { name: 'Refresh' })
      .first()
      .click();
    const jobOpsCard = appContent(page).locator('[data-slot="card"]', {
      hasText: 'Job operations control',
    });
    const row = jobOpsCard.locator('tbody tr').filter({
      hasText: 'automation_cycle',
    });
    await expect(row.getByText('DISABLED', { exact: true })).toBeVisible();

    const alerts = await pwInvoke<Array<{ alertType: string }>>(
      page,
      'list_workflow_job_failure_alerts_command',
      { callerRole: 'admin', limit: 20 }
    );
    expect(alerts.some(a => a.alertType === 'GUARD_STOP')).toBe(true);

    await appContent(page)
      .getByPlaceholder('Reason for override (required)')
      .fill('post-incident verification');
    await appContent(page)
      .getByRole('button', { name: 'Override and re-enable job' })
      .click();
    await expect(
      page.locator('[data-sonner-toast][data-type="success"]')
    ).toBeVisible({ timeout: 10_000 });
    await expect(row.getByText('ACTIVE', { exact: true })).toBeVisible();

    const overrides = await pwInvoke<Array<{ action: string }>>(
      page,
      'list_workflow_job_manual_override_log_command',
      { callerRole: 'admin', limit: 20 }
    );
    expect(overrides.some(o => o.action === 'RECOVERY_GUARD_OVERRIDE')).toBe(
      true
    );
  });

  test('deployment safety blocks high-risk prod deploy; override succeeds', async ({
    page,
  }) => {
    await gotoAutomationRules(page);
    await pwInvoke(page, 'playwright_operational_stub_command', {
      action: 'set_deploy_high_risk',
      value: true,
    });
    await appContent(page)
      .getByRole('button', { name: 'Refresh' })
      .first()
      .click();
    const lifecycleCard = appContent(page).locator('[data-slot="card"]', {
      has: page.getByText('Rule deployment lifecycle'),
    });
    await lifecycleCard.scrollIntoViewIfNeeded();
    await lifecycleCard.getByRole('combobox').first().click();
    await page.getByRole('option', { name: /PW reliability rule/i }).click();

    await lifecycleCard
      .locator('div.space-y-2')
      .filter({ hasText: 'Deploy version id' })
      .locator('input')
      .fill('ver:env-prod:high');
    await lifecycleCard.getByRole('button', { name: 'Deploy version' }).click();
    await expect(
      page.locator('[data-sonner-toast][data-type="error"]')
    ).toBeVisible({ timeout: 10_000 });

    const riskBefore = await pwInvoke<unknown[]>(
      page,
      'list_deployment_risk_timeline_command',
      { callerRole: 'admin' }
    );
    expect(riskBefore.length).toBeGreaterThanOrEqual(1);

    await lifecycleCard.getByLabel(/Admin: acknowledge HIGH/i).click();
    await lifecycleCard.getByRole('button', { name: 'Deploy version' }).click();
    await expect(
      page.locator('[data-sonner-toast][data-type="success"]')
    ).toBeVisible({ timeout: 10_000 });

    const deployLog = await pwInvoke<Array<{ deploymentStatus: string }>>(
      page,
      'list_workflow_rule_deployment_log',
      { callerRole: 'admin', ruleId: 'rule-pw-reliability', limit: 10 }
    );
    expect(deployLog.some(d => d.deploymentStatus === 'OVERRIDE_ADMIN')).toBe(
      true
    );

    await pwInvoke(page, 'playwright_operational_stub_command', {
      action: 'set_deploy_high_risk',
      value: false,
    });
  });

  test('execution timeline events are chronologically ordered', async ({
    page,
  }) => {
    await gotoAutomationRules(page);
    const tl = await pwInvoke<{
      events: Array<{ startedAt: string; status: string }>;
    }>(page, 'get_job_execution_timeline_command', {
      jobId: 'automation_cycle',
      hours: 48,
      callerRole: 'admin',
    });
    const times = tl.events.map(e =>
      new Date(e.startedAt.replace(' ', 'T') + 'Z').getTime()
    );
    const sorted = [...times].sort((a, b) => a - b);
    expect(times).toEqual(sorted);
    expect(new Set(times).size).toBe(times.length);
  });

  test('recovery log export and simulate recovery surface success toasts', async ({
    page,
  }) => {
    await gotoAutomationRules(page);
    const jobOpsCard = appContent(page).locator('[data-slot="card"]', {
      hasText: 'Job operations control',
    });
    await jobOpsCard
      .getByRole('button', { name: 'Export recovery log CSV' })
      .click();
    await expect(
      page.locator('[data-sonner-toast][data-type="success"]').filter({
        hasText: /Recovery log exported/i,
      })
    ).toBeVisible({ timeout: 10_000 });
    await jobOpsCard
      .getByRole('button', { name: 'Simulate recovery (read-only)' })
      .click();
    await expect(
      page.locator('[data-sonner-toast][data-type="success"]').filter({
        hasText: /Simulation complete/i,
      })
    ).toBeVisible({ timeout: 10_000 });
  });
});
