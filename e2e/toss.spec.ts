import { expect, test } from '@playwright/test';

test('Given three configured teams, When Office Toss runs, Then one candidate per team appears in a reproducible URL', async ({ page }) => {
  await page.goto('/');

  await test.step('Given the default Backend, Frontend, and Platform lists are editable', async () => {
    await expect(page.locator('.builder-intro')).toBeVisible();
    await expect(page.locator('.builder-intro').getByText('SET UP', { exact: true })).toHaveCount(0);
    await expect(page.locator('.wordmark')).toHaveText('TOSS (LIKE A BOSS)');
    await expect(page.getByText('Add one or more lists. Choose how many items to pick from each.')).toBeVisible();
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Office toss');
    await expect(page.getByTestId('total-picks')).toHaveText('3 picks');
    await expect(page.getByLabel('Backend item 1', { exact: true })).toHaveValue('Bogdan');
    await expect(page.getByPlaceholder('Image URL (optional)')).toHaveCount(0);
    await expect(page.getByTestId('share-length')).toHaveText(/^\d+ \/ 2,000 characters$/);
    await expect(page.getByText('ELM 0.19.2')).toHaveCount(0);
    await expect(page.locator('.site-footer')).toHaveText(/tossed together @ berlin \d{4}/);
    await expect(page.locator('.tower-mark')).toBeVisible();
  });

  await test.step('When group colors change and the Run screen opens', async () => {
    await page.getByLabel('Backend card color').fill('#123456');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Office toss' })).toBeVisible();
    await expect(page.getByTestId('run-group-Backend')).toHaveCSS('background-color', 'rgb(18, 52, 86)');
    const pickerLength = Number((await page.getByTestId('share-length').textContent())?.split(' ')[0].replace(',', ''));
    expect(pickerLength).toBe(`https://toss.quitter.live/${await page.evaluate(() => location.hash)}`.length);
  });

  await test.step('Then Toss reveals one unique candidate from each team', async () => {
    const hashBefore = await page.evaluate(() => location.hash);
    await page.getByRole('button', { name: 'Toss 3 picks' }).click();
    await expect(page.getByTestId('result-card')).toHaveCount(3);
    await expect(page.getByTestId('result-card').nth(0)).toBeVisible();
    await expect.poll(() => page.evaluate(() => location.hash)).not.toBe(hashBefore);
    const resultHash = await page.evaluate(() => location.hash);
    expect(resultHash).toMatch(/^#r\.[A-Za-z0-9_-]+~[0-9a-z]+$/);
    expect(resultHash).not.toContain('IPA');
    const resultLength = Number((await page.getByTestId('share-length').textContent())?.split(' ')[0].replace(',', ''));
    expect(resultLength).toBe(`https://toss.quitter.live/${resultHash}`.length);

    await expect(page.getByTestId('result-group-Backend').getByTestId('result-card')).toHaveCount(1);
    await expect(page.getByTestId('result-group-Frontend').getByTestId('result-card')).toHaveCount(1);
    await expect(page.getByTestId('result-group-Platform').getByTestId('result-card')).toHaveCount(1);
  });

  await test.step('And the result URL reproduces in a clean browser page', async () => {
    const resultUrl = page.url();
    const fresh = await page.context().newPage();
    await fresh.goto(resultUrl);
    await expect(fresh.getByTestId('result-card')).toHaveCount(3);
    expect(await fresh.getByTestId('result-card').allTextContents()).toEqual(
      await page.getByTestId('result-card').allTextContents(),
    );
  });
});

test('Given an empty option, When Run is requested, Then the builder explains the failure', async ({ page }) => {
  await page.goto('/');
  const firstBackend = page.getByRole('textbox', { name: 'Backend item 1', exact: true });
  await firstBackend.fill('');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.locator('.builder-intro')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Fill in every item.');
  await expect(firstBackend).toHaveAttribute('aria-invalid', 'true');
});

test('Given a list with two remaining items, Then Take stops at one so a toss cannot select everything', async ({ page }) => {
  await page.goto('/');

  const increase = page.getByRole('button', { name: 'Increase Backend picks' });
  await increase.click();
  await expect(page.locator('.pick-control').first().locator('strong')).toHaveText('2');

  await page.getByRole('button', { name: 'Remove Backend item 3' }).click();
  await expect(page.locator('.pick-control').first().locator('strong')).toHaveText('1');
  await expect(increase).toBeDisabled();
  await expect(page.getByText('FROM 2', { exact: true }).first()).toBeVisible();
});

test('Given an unfinished toss, Then its editing and run states survive sharing and Change', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Name', { exact: true }).fill('Still choosing');
  await page.getByRole('textbox', { name: 'Backend item 1', exact: true }).fill('Pilsner');
  await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#e\.[A-Za-z0-9_-]+$/);

  const editingUrl = page.url();
  const fresh = await page.context().newPage();
  await fresh.goto(editingUrl);
  await expect(fresh.locator('.builder-intro')).toBeVisible();
  await expect(fresh.getByLabel('Name', { exact: true })).toHaveValue('Still choosing');
  await expect(fresh.getByRole('textbox', { name: 'Backend item 1', exact: true })).toHaveValue('Pilsner');
  await fresh.reload();
  await expect(fresh.getByLabel('Name', { exact: true })).toHaveValue('Still choosing');
  await expect(fresh.getByRole('textbox', { name: 'Backend item 1', exact: true })).toHaveValue('Pilsner');

  await fresh.getByRole('button', { name: 'Continue' }).click();
  await expect.poll(() => fresh.evaluate(() => location.hash)).toMatch(/^#r\.[A-Za-z0-9_-]+$/);
  await fresh.getByRole('button', { name: '← Change' }).click();
  await expect.poll(() => fresh.evaluate(() => location.hash)).toMatch(/^#e\.[A-Za-z0-9_-]+$/);
  await expect(fresh.getByLabel('Name', { exact: true })).toHaveValue('Still choosing');
});

test('Given an encoded URL above 2,000 characters, Then its exact size is shown and Continue is disabled', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Backend item 1', exact: true }).fill('x'.repeat(1800));

  const meter = page.getByTestId('share-length');
  await expect(meter).toHaveText(/^\d{1,3},\d{3} \/ 2,000 characters$/);
  const measuredLength = Number((await meter.textContent())?.split(' ')[0].replace(',', ''));
  expect(measuredLength).toBeGreaterThan(2000);
  await expect(page.getByRole('alert')).toContainText(`Picker too large: ${measuredLength.toLocaleString('en-US')} / 2,000 characters. Shorten labels or remove items.`);
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
});

test('Given an old v1 link containing an image URL, Then its text survives and the image is ignored', async ({ page }) => {
  await page.goto('/#AQ5PbGQgaW1hZ2UgdG9zcwABBEZvb2T_1DsXFxcBAQVSYW1lbh1odHRwczovL2V4YW1wbGUuY29tL3JhbWVuLmpwZw');

  await expect(page.getByRole('heading', { name: 'Old image toss' })).toBeVisible();
  await expect(page.getByText('Ramen', { exact: true })).toBeVisible();
  await expect(page.locator('img')).toHaveCount(0);
});

test('Given local presets, When two tosses are saved, Then both survive reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Save here' }).click();
  await page.getByRole('button', { name: '+ New toss' }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('New toss');
  await page.getByLabel('Name', { exact: true }).fill('Weekend toss');
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Weekend toss');
  await page.getByRole('button', { name: 'Save here' }).click();
  await page.reload();

  await expect(page.getByLabel('Saved tosses').locator('option')).toHaveCount(3);
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Weekend toss');
});

test('Given a damaged shared payload, Then Toss recovers without touching the builder', async ({ page }) => {
  await page.goto('/#%%%');

  await expect(page.locator('.builder-intro')).toBeVisible();
  await expect(page.getByRole('status')).toContainText('link is damaged');
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Office toss');
});

test('Given a mobile viewport, Then the builder fits without horizontal scrolling', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile');
  await page.goto('/');

  const sizes = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));

  expect(sizes.content).toBeLessThanOrEqual(sizes.viewport);
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
});

test('Given a desktop builder, Then the intro and preview stay compact while group forms use two columns', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  await page.goto('/');

  const layout = await page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Missing ${selector}`);
      const box = element.getBoundingClientRect();
      return { top: box.top, width: box.width };
    };

    const cards = [...document.querySelectorAll<HTMLElement>('.group-card')].map((card) => {
      const box = card.getBoundingClientRect();
      return { top: box.top, width: box.width };
    });

    return {
      intro: rect('.builder-intro'),
      preview: rect('.preview-sticky'),
      editor: rect('.editor-column'),
      cards,
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    };
  });

  expect(layout.preview.top).toBeLessThan(layout.cards[0].top);
  expect(Math.abs(layout.cards[0].top - layout.cards[1].top)).toBeLessThan(1);
  expect(layout.cards[0].width).toBeLessThan(layout.editor.width * 0.7);
  expect(layout.content).toBeLessThanOrEqual(layout.viewport);
});

test('Given the agent page, When Copy is pressed, Then the complete link recipe reaches the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/?agent');

  await expect(page.getByRole('heading', { name: 'Make Toss links' })).toBeVisible();
  await expect(page.getByTestId('agent-prompt')).toContainText('Base64URL without padding');
  await expect(page.getByTestId('agent-prompt')).toContainText('function encodePicker');
  await expect(page.getByTestId('agent-prompt')).toContainText('image slot is always an empty string');
  await page.getByRole('button', { name: 'Copy prompt' }).click();
  await expect(page.getByRole('status')).toHaveText('Copied.');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('https://toss.quitter.live/#');

  const generatedUrl = await page.evaluate(() => {
    const prompt = document.querySelector('[data-testid="agent-prompt"]')?.textContent || '';
    const reference = prompt.split('Reference JavaScript:\n\n')[1];
    const run = new Function(`${reference}\nreturn makeTossUrl({ title: "Agent dinner", groups: [{ name: "Food", background: "#ffd43b", foreground: "#171717", pickCount: 1, options: [{ label: "Ramen" }] }] });`);
    return run() as string;
  });
  await page.goto('/' + new URL(generatedUrl).hash);
  await expect(page.getByRole('heading', { name: 'Agent dinner' })).toBeVisible();
  await expect(page.getByText('Ramen', { exact: true })).toBeVisible();
});

test('Given the home page, When the agent lead is followed, Then the prompt opens', async ({ page }) => {
  await page.goto('/');

  const agentLink = page.getByRole('link', { name: 'Or tell your agent what you need to toss' });
  await expect(agentLink).toHaveAttribute('href', '/agent');
  await agentLink.click();
  await expect(page).toHaveURL(/\/agent$/);
  await expect(page.getByRole('heading', { name: 'Make Toss links' })).toBeVisible();
});

test('Given clipboard denial on the agent page, When Copy is pressed, Then the failure is visible', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'clipboard', {
      configurable: true,
      get: () => ({ writeText: () => Promise.reject(new Error('denied')) }),
    });
  });
  await page.goto('/?agent');

  await page.getByRole('button', { name: 'Copy prompt' }).click();
  await expect(page.getByRole('status')).toHaveText('Copy failed. Select the prompt and copy it manually.');
});
