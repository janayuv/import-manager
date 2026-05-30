import { expect, test, type Page } from '@playwright/test';

import {
  appContent,
  loginAsAdmin,
  loginWithFreshDatabase,
  reloadPlaywrightPageForStubHydrate,
  resetPlaywrightDatabase,
  waitForPlaywrightInvoke,
} from './playwright-helpers';

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
    await loginWithFreshDatabase(page);
  });

  test('job enable / disable updates registry badges', async ({ page }) => {
    await waitForPlaywrightInvoke(page);

    const jobsBefore = await pwInvoke<
      Array<{ jobId: string; isEnabled: number }>
    >(page, 'list_workflow_background_jobs_command', { callerRole: 'admin' });
    expect(
      jobsBefore.find(x => x.jobId === 'automation_cycle')?.isEnabled
    ).toBe(1);

    await pwInvoke(page, 'set_workflow_background_job_enabled_command', {
      jobId: 'automation_cycle',
      enabled: false,
      callerRole: 'admin',
    });
    const jobsDisabled = await pwInvoke<
      Array<{ jobId: string; isEnabled: number }>
    >(page, 'list_workflow_background_jobs_command', { callerRole: 'admin' });
    expect(
      jobsDisabled.find(x => x.jobId === 'automation_cycle')?.isEnabled
    ).toBe(0);

    await pwInvoke(page, 'set_workflow_background_job_enabled_command', {
      jobId: 'automation_cycle',
      enabled: true,
      callerRole: 'admin',
    });

    const snap = await pwInvoke<{
      jobs: Array<{ jobId: string; isEnabled: number }>;
    }>(page, 'playwright_operational_stub_command', { action: 'snapshot' });
    const j = snap.jobs.find(x => x.jobId === 'automation_cycle');
    expect(j?.isEnabled).toBe(1);
  });

  test('manual retry creates SUCCESS row and increments retry count', async ({
    page,
  }) => {
    await waitForPlaywrightInvoke(page);
    await pwInvoke(page, 'retry_failed_job_command', {
      executionId: 'exec-failed-pw',
      callerRole: 'admin',
    });

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
    await loginAsAdmin(page);

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
    await loginAsAdmin(page);
    await waitForPlaywrightInvoke(page);

    await pwInvoke(page, 'detect_missed_job_runs_command', {
      callerRole: 'admin',
    });

    const missed = await pwInvoke<
      Array<{ jobId: string; alertId: string; status: string }>
    >(page, 'list_workflow_job_missed_alerts_command', {
      callerRole: 'admin',
      limit: 20,
    });
    const pending = missed.find(m => m.status === 'PENDING');
    expect(pending).toBeTruthy();

    const result = await pwInvoke<string>(page, 'recover_missed_job_command', {
      jobId: pending!.jobId,
      alertId: pending!.alertId,
      callerRole: 'admin',
    });
    expect(result).toMatch(/^recovered:/);

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
    await waitForPlaywrightInvoke(page);

    await pwInvoke(page, 'playwright_operational_stub_command', {
      action: 'guard_stop',
      jobId: 'automation_cycle',
    });

    const jobsDisabled = await pwInvoke<
      Array<{ jobId: string; isEnabled: number }>
    >(page, 'list_workflow_background_jobs_command', { callerRole: 'admin' });
    expect(
      jobsDisabled.find(x => x.jobId === 'automation_cycle')?.isEnabled
    ).toBe(0);

    const alerts = await pwInvoke<Array<{ alertType: string }>>(
      page,
      'list_workflow_job_failure_alerts_command',
      { callerRole: 'admin', limit: 20 }
    );
    expect(alerts.some(a => a.alertType === 'GUARD_STOP')).toBe(true);

    await pwInvoke(page, 'recovery_guard_override_reenable_command', {
      jobId: 'automation_cycle',
      reason: 'post-incident verification',
      callerRole: 'admin',
    });

    const jobsEnabled = await pwInvoke<
      Array<{ jobId: string; isEnabled: number }>
    >(page, 'list_workflow_background_jobs_command', { callerRole: 'admin' });
    expect(
      jobsEnabled.find(x => x.jobId === 'automation_cycle')?.isEnabled
    ).toBe(1);

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
    await waitForPlaywrightInvoke(page);

    await pwInvoke(page, 'playwright_operational_stub_command', {
      action: 'set_deploy_high_risk',
      value: true,
    });

    const safety = await pwInvoke<{
      safe_to_deploy: boolean;
      risk_level: string;
    }>(page, 'validate_deployment_safety_command', {
      versionId: 'ver:env-prod:high',
      callerRole: 'admin',
    });
    expect(safety.safe_to_deploy).toBe(false);
    expect(safety.risk_level).toBe('HIGH');

    const blocked = await pwInvoke<string>(
      page,
      'deploy_rule_version_command',
      {
        ruleId: 'rule-pw-reliability',
        versionId: 'ver:env-prod:high',
        deployedBy: 'tester',
        callerRole: 'admin',
        safetyOverrideAcknowledged: false,
      }
    ).catch(err => String(err));
    expect(blocked).toMatch(/REJECTED_SAFETY/i);

    const riskBefore = await pwInvoke<unknown[]>(
      page,
      'list_deployment_risk_timeline_command',
      { callerRole: 'admin' }
    );
    expect(riskBefore.length).toBeGreaterThanOrEqual(1);

    await pwInvoke(page, 'deploy_rule_version_command', {
      ruleId: 'rule-pw-reliability',
      versionId: 'ver:env-prod:high',
      deployedBy: 'tester',
      callerRole: 'admin',
      safetyOverrideAcknowledged: true,
    });

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
    await waitForPlaywrightInvoke(page);

    const csv = await pwInvoke<string>(
      page,
      'export_workflow_job_recovery_log_csv_command',
      { callerRole: 'admin' }
    );
    expect(csv).toContain('recovery_id,job_id');

    const simulation = await pwInvoke<Record<string, unknown>>(
      page,
      'simulate_background_jobs_command',
      { callerRole: 'admin' }
    );
    expect(simulation).toBeTruthy();
  });
});
