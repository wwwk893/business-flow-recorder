/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { test, expect } from './crxRecorderTest';
import { beginNewFlowFromLibraryLikeUser, fillFlowMetaLikeUser, humanClick } from './humanLike';
import { sourceLines } from './utils';

test.describe.configure({ timeout: 90_000 });

test('explicit legacy recorder mode opens the legacy recorder/player surface', async ({ page, attachRecorder, baseURL }) => {
  await page.goto(`${baseURL}/empty.html`);
  const recorderPage = await attachRecorder(page, { mode: 'legacy' });

  await expect(recorderPage.getByTitle('Record')).toBeVisible();
  await expect(recorderPage.locator('.business-flow-panel')).toHaveCount(0);
  await expect.poll(() => sourceLines(recorderPage)).not.toContain('  await page.goto("about:blank");');
});

test('explicit business-flow recorder mode opens the business flow surface', async ({ page, attachRecorder, baseURL }) => {
  await page.goto(`${baseURL}/empty.html`);
  const recorderPage = await attachRecorder(page, { mode: 'business-flow' });

  await expect(recorderPage.locator('.business-flow-panel')).toBeVisible();
  await expect(recorderPage.getByRole('button', { name: /新建流程/ })).toBeVisible();
  await expect(recorderPage.locator('.side-panel-nav')).toBeVisible();
  await expect(recorderPage.locator('.side-panel-nav').getByRole('button', { name: /录制/ })).toHaveCount(0);
  await expect(recorderPage.locator('.side-panel-nav').getByRole('button', { name: /^断言$/ })).toHaveCount(0);
});

test('business-flow recorder does not expose plugin replay navigation while recording', async ({ page, attachRecorder, baseURL }) => {
  await page.goto(`${baseURL}/empty.html`);
  const recorderPage = await attachRecorder(page, { mode: 'business-flow' });

  await beginNewFlowFromLibraryLikeUser(recorderPage);
  await fillFlowMetaLikeUser(recorderPage, '流程名称', '导出交接录制流程');
  await humanClick(recorderPage.getByRole('button', { name: '保存并开始录制' }));
  await expect(recorderPage.locator('.recording-status')).toContainText('录制中');
  await expect(recorderPage.locator('.side-panel-nav')).not.toContainText('回放');
  await expect(recorderPage.getByRole('button', { name: '停止录制' })).toBeVisible();
});

test('opening code preview switches recorder to standby before finalization', async ({ page, attachRecorder, baseURL }) => {
  await page.goto(`${baseURL}/empty.html`);
  const recorderPage = await attachRecorder(page, { mode: 'business-flow' });

  await beginNewFlowFromLibraryLikeUser(recorderPage);
  await fillFlowMetaLikeUser(recorderPage, '流程名称', '代码预览停止采集');
  await humanClick(recorderPage.getByRole('button', { name: '保存并开始录制' }));
  await expect(recorderPage.locator('.recording-status')).toContainText('录制中');

  await page.goto(`${baseURL}/antd-users-real.html`);
  await expect(page.getByTestId('create-user-btn')).toBeVisible();
  await page.getByTestId('create-user-btn').click();
  await expect.poll(() => recorderPage.locator('.flow-step').count(), { timeout: 20_000 }).toBeGreaterThanOrEqual(1);

  await humanClick(recorderPage.getByRole('button', { name: '停止录制' }));
  await recorderPage.locator('.side-panel-nav').getByRole('button', { name: '导出', exact: true }).click();
  await expect(recorderPage.locator('.export-review-panel')).toBeVisible();

  await recorderPage.evaluate(() => {
    const targetWindow = window as typeof window & {
      __codePreviewDispatches?: string[];
      __codePreviewDrainReleased?: boolean;
      __releaseCodePreviewDrain?: () => void;
    };
    targetWindow.__codePreviewDispatches = [];
    targetWindow.__codePreviewDrainReleased = false;
    const dispatchWindow = window as typeof window & { dispatch: (data: any) => Promise<void> };
    const originalDispatch = dispatchWindow.dispatch;
    dispatchWindow.dispatch = async data => {
      targetWindow.__codePreviewDispatches?.push(data?.event);
      return originalDispatch(data);
    };

    const originalSendMessage = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = ((message: any, ...args: any[]) => {
      if (message?.event === 'pageContextEventsRequested') {
        if (targetWindow.__codePreviewDrainReleased)
          return Promise.resolve([]);
        return new Promise(resolve => {
          targetWindow.__releaseCodePreviewDrain = () => {
            targetWindow.__codePreviewDrainReleased = true;
            resolve([]);
          };
        });
      }
      return originalSendMessage(message, ...args);
    }) as typeof chrome.runtime.sendMessage;
  });

  const openCodePreview = recorderPage.getByRole('button', { name: '查看代码预览' }).click({ timeout: 10_000 });
  let assertionError: unknown;
  try {
    await expect.poll(async () => {
      return await recorderPage.evaluate(() => (window as typeof window & { __codePreviewDispatches?: string[] }).__codePreviewDispatches ?? []);
    }, { timeout: 1_000 }).toContain('setMode');
    const blockedDispatches = await recorderPage.evaluate(() => (window as typeof window & { __codePreviewDispatches?: string[] }).__codePreviewDispatches ?? []);
    expect(blockedDispatches).not.toContain('businessFlowCodeChanged');
  } catch (error) {
    assertionError = error;
  } finally {
    await recorderPage.evaluate(() => (window as typeof window & { __releaseCodePreviewDrain?: () => void }).__releaseCodePreviewDrain?.());
    await openCodePreview.catch(() => {});
  }
  if (assertionError)
    throw assertionError;

  const dispatches = await recorderPage.evaluate(() => (window as typeof window & { __codePreviewDispatches?: string[] }).__codePreviewDispatches ?? []);
  expect(dispatches[0]).toBe('setMode');
});
