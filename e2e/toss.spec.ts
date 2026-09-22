import { expect, test, type Page } from '@playwright/test';

const presetTitles = [
  'Technology toss',
  'Which subscription to cancel?',
  'What should we eat?',
  'Where should we go on vacation?',
];

const presetOptionCounts = [30, 40, 48, 48];
const presetGroupCounts = [3, 4, 3, 4];
const presetPickCounts = [3, 8, 3, 8];

function presetIndex(identity: string, userAgent: string) {
  let hash = 2166136261;
  for (const byte of new TextEncoder().encode(`${identity}\n${userAgent}`)) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % presetTitles.length;
}

async function identityForPreset(page: Page, target: number) {
  const userAgent = await page.evaluate(() => navigator.userAgent);
  for (let suffix = 1; suffix < 1000; suffix += 1) {
    const identity = `203.0.113.${suffix}`;
    if (presetIndex(identity, userAgent) === target) return identity;
  }
  throw new Error(`Could not find identity for preset ${target}`);
}

async function usePreset(page: Page, target: number) {
  const identity = await identityForPreset(page, target);
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': identity });
}

test('Given four visitors, When Toss opens, Then IP plus user agent assigns every stable starter', async ({ page, context }) => {
  for (let index = 0; index < presetTitles.length; index += 1) {
    const visitor = index === 0 ? page : await context.newPage();
    await usePreset(visitor, index);
    await visitor.goto('/');
    await expect(visitor.getByLabel('Name', { exact: true })).toHaveValue(presetTitles[index]);
    await expect(visitor.locator('.choice-row')).toHaveCount(presetOptionCounts[index]);
    await expect(visitor.locator('.group-card')).toHaveCount(presetGroupCounts[index]);
    await expect(visitor.getByTestId('total-picks')).toHaveText(`${presetPickCounts[index]} picks`);
    await expect(visitor.getByRole('button', { name: 'Continue' })).toBeEnabled();
    await visitor.reload();
    await expect(visitor.getByLabel('Name', { exact: true })).toHaveValue(presetTitles[index]);
  }
});

test('Given lively starter content, Then subscriptions name real services and food builds a complete order', async ({ page, context }) => {
  await usePreset(page, 1);
  await page.goto('/');
  await expect(page.getByLabel('Listen & read item 1', { exact: true })).toHaveValue('Spotify');
  await expect(page.locator('.pick-control strong')).toHaveText(['2', '2', '2', '2']);

  const food = await context.newPage();
  await usePreset(food, 2);
  await food.goto('/');
  await expect(food.getByLabel('Starter / salad item 1', { exact: true })).toHaveValue('Caesar salad');
  await expect(food.getByLabel('Main item 1', { exact: true })).toHaveValue('Ramen');
  await expect(food.getByLabel('Drink item 1', { exact: true })).toHaveValue('Sparkling water');
});

test('Given no forwarded IP, When Toss opens, Then socket IP still selects a stable usable starter', async ({ page }) => {
  await page.goto('/');

  const title = await page.getByLabel('Name', { exact: true }).inputValue();
  expect(presetTitles).toContain(title);
  await page.reload();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(title);
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
});

test('Given three technology lists, When Technology toss runs, Then one technology per layer appears in a reproducible URL', async ({ page }) => {
  await usePreset(page, 0);
  await page.goto('/');

  await test.step('Given the default Frontend, Backend, and Database lists are editable', async () => {
    await expect(page.locator('.builder-intro')).toBeVisible();
    await expect(page.locator('.builder-intro').getByText('SET UP', { exact: true })).toHaveCount(0);
    await expect(page.locator('.wordmark')).toHaveText('TOSS (LIKE A BOSS)');
    await expect(page.getByText('Add one or more lists. Choose how many items to pick from each.')).toBeVisible();
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Technology toss');
    await expect(page.getByTestId('total-picks')).toHaveText('3 picks');
    await expect(page.getByLabel('Frontend item 1', { exact: true })).toHaveValue('React');
    await expect(page.getByLabel('Backend item 1', { exact: true })).toHaveValue('Elixir / Phoenix');
    await expect(page.getByLabel('Database item 1', { exact: true })).toHaveValue('PostgreSQL');
    await expect(page.getByPlaceholder('Image URL (optional)')).toHaveCount(0);
    await expect(page.getByTestId('share-length')).toHaveText(/^\d+ \/ 2,000 characters$/);
    await expect(page.getByText('ELM 0.19.2')).toHaveCount(0);
    await expect(page.locator('.site-footer')).toHaveText(/tossed together @ berlin \d{4}/);
    await expect(page.locator('.tower-mark')).toBeVisible();
  });

  await test.step('When group colors change and the Run screen opens', async () => {
    await page.getByLabel('Frontend card color').fill('#123456');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Technology toss' })).toBeVisible();
    await expect(page.getByTestId('run-group-Frontend')).toHaveCSS('background-color', 'rgb(18, 52, 86)');
    const pickerLength = Number((await page.getByTestId('share-length').textContent())?.split(' ')[0].replace(',', ''));
    expect(pickerLength).toBe(`https://toss.meta-uber-engineer.dev/${await page.evaluate(() => location.hash)}`.length);
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
    expect(resultLength).toBe(`https://toss.meta-uber-engineer.dev/${resultHash}`.length);

    await expect(page.getByTestId('result-group-Frontend').getByTestId('result-card')).toHaveCount(1);
    await expect(page.getByTestId('result-group-Backend').getByTestId('result-card')).toHaveCount(1);
    await expect(page.getByTestId('result-group-Database').getByTestId('result-card')).toHaveCount(1);
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
  await usePreset(page, 0);
  await page.goto('/');
  const firstFrontend = page.getByRole('textbox', { name: 'Frontend item 1', exact: true });
  await firstFrontend.fill('');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.locator('.builder-intro')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Fill in every item.');
  await expect(firstFrontend).toHaveAttribute('aria-invalid', 'true');
});

test('Given a list with two remaining items, Then Take stops at one so a toss cannot select everything', async ({ page }) => {
  await usePreset(page, 0);
  await page.goto('/');

  const increase = page.getByRole('button', { name: 'Increase Frontend picks' });
  await increase.click();
  await expect(page.locator('.pick-control').first().locator('strong')).toHaveText('2');

  for (let item = 10; item >= 3; item -= 1) {
    await page.getByRole('button', { name: `Remove Frontend item ${item}` }).click();
  }
  await expect(page.locator('.pick-control').first().locator('strong')).toHaveText('1');
  await expect(increase).toBeDisabled();
  await expect(page.getByText('FROM 2', { exact: true }).first()).toBeVisible();
});

test('Given an unfinished toss, Then its editing and run states survive sharing and Change', async ({ page }) => {
  await usePreset(page, 0);
  await page.goto('/');
  await page.getByLabel('Name', { exact: true }).fill('Still choosing');
  await page.getByRole('textbox', { name: 'Frontend item 1', exact: true }).fill('Pilsner');
  await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#e\.[A-Za-z0-9_-]+$/);

  const editingUrl = page.url();
  const fresh = await page.context().newPage();
  await fresh.goto(editingUrl);
  await expect(fresh.locator('.builder-intro')).toBeVisible();
  await expect(fresh.getByLabel('Name', { exact: true })).toHaveValue('Still choosing');
  await expect(fresh.getByRole('textbox', { name: 'Frontend item 1', exact: true })).toHaveValue('Pilsner');
  await fresh.reload();
  await expect(fresh.getByLabel('Name', { exact: true })).toHaveValue('Still choosing');
  await expect(fresh.getByRole('textbox', { name: 'Frontend item 1', exact: true })).toHaveValue('Pilsner');

  await fresh.getByRole('button', { name: 'Continue' }).click();
  await expect.poll(() => fresh.evaluate(() => location.hash)).toMatch(/^#r\.[A-Za-z0-9_-]+$/);
  await fresh.getByRole('button', { name: '← Change' }).click();
  await expect.poll(() => fresh.evaluate(() => location.hash)).toMatch(/^#e\.[A-Za-z0-9_-]+$/);
  await expect(fresh.getByLabel('Name', { exact: true })).toHaveValue('Still choosing');
});

test('Given an encoded URL above 2,000 characters, Then its exact size is shown and Continue is disabled', async ({ page }) => {
  await usePreset(page, 0);
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Frontend item 1', exact: true }).fill('x'.repeat(1800));

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
  await usePreset(page, 0);
  await page.goto('/#%%%');

  await expect(page.locator('.builder-intro')).toBeVisible();
  await expect(page.getByRole('status')).toContainText('link is damaged');
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Technology toss');
});

test('Given a mobile viewport, Then the builder fits without horizontal scrolling', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile');
  await usePreset(page, 0);
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
  await usePreset(page, 0);
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
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('https://toss.meta-uber-engineer.dev/#');

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
