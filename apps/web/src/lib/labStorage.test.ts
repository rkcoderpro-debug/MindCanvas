// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mergeStoredLabs, readStoredLabs, saveStoredLab, deleteStoredLab, readLabDraft, writeLabDraft } from './labStorage';
const input = { title:'HTML only', subject:'physics' as const, learnerLevel:'', sourceFileName:'', sourceText:'', request:'', designPrompt:'', planPrompt:'', programPrompt:'', design:null, programHtml:'<html><body>saved</body></html>' };
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); localStorage.clear(); vi.restoreAllMocks(); });
describe('durable Lab storage', () => {
  it('saves HTML-only labs, updates the same ID and isolates accounts', async () => {
    const first = await saveStoredLab('a', input);
    await saveStoredLab('a', { ...input, id:first.id, programHtml:'<html>updated</html>' });
    const rows = (await readStoredLabs('a')).filter(row => !row.systemDemo);
    expect(rows).toHaveLength(1); expect(rows[0].programHtml).toBe('<html>updated</html>');
    expect((await readStoredLabs('b')).filter(row => !row.systemDemo)).toHaveLength(0);
    await deleteStoredLab('a', first.id);
    expect((await readStoredLabs('a')).filter(row => !row.systemDemo)).toHaveLength(0);
  });
  it('migrates legacy data without deleting its recovery copy or trimming old labs', async () => {
    const rows = Array.from({length:45}, (_,i) => ({...input,id:`old-${i}`,createdAt:'2026-01-01',updatedAt:'2026-01-01'}));
    const old = JSON.stringify(rows); localStorage.setItem('mindcanvas:labs:v1:a', old);
    await saveStoredLab('a', input);
    expect((await readStoredLabs('a')).filter(row=>!row.systemDemo)).toHaveLength(46);
    expect(localStorage.getItem('mindcanvas:labs:v1:a')).toBe(old);
  });
  it('does not re-import deleted migrated labs', async () => {
    localStorage.setItem('mindcanvas:labs:v1:a', JSON.stringify([{...input,id:'old',createdAt:'2026',updatedAt:'2026'}]));
    await deleteStoredLab('a','old');
    expect((await readStoredLabs('a')).filter(row=>!row.systemDemo)).toHaveLength(0);
  });
  it('rejects failed storage instead of returning a successful Lab', async () => {
    vi.spyOn(indexedDB, 'open').mockImplementation(() => { throw new DOMException('Full','QuotaExceededError'); });
    await expect(saveStoredLab('a', input)).rejects.toThrow('Full');
  });
  it('keeps drafts account scoped and refuses to overwrite corrupt legacy data', async () => {
    await writeLabDraft('a', { programHtml:input.programHtml });
    expect(await readLabDraft('a')).toEqual({programHtml:input.programHtml});
    expect(await readLabDraft('b')).toBeUndefined();
    localStorage.setItem('mindcanvas:labs:v1:b','broken');
    await expect(saveStoredLab('b',input)).rejects.toThrow();
    expect(localStorage.getItem('mindcanvas:labs:v1:b')).toBe('broken');
  });
  it('imports cloud Labs that are missing in a profile and keeps a conflicting local copy', async () => {
    const local = await saveStoredLab('a', { ...input, id: 'same', programHtml: '<html><body>local</body></html>' });
    const result = await mergeStoredLabs('a', [
      { ...input, id: 'remote', updatedAt: '2026-09-24T00:00:00.000Z', createdAt: '2026-09-24T00:00:00.000Z', programHtml: '<html><body>remote</body></html>' },
      { ...input, id: local.id, updatedAt: '2026-09-25T00:00:00.000Z', programHtml: '<html><body>newer cloud</body></html>' },
    ]);
    expect(result).toEqual({ added: 1, conflicts: 1 });
    const rows = (await readStoredLabs('a')).filter(row => !row.systemDemo);
    expect(rows.find(row => row.id === 'remote')?.programHtml).toContain('remote');
    expect(rows.find(row => row.id === 'same')?.programHtml).toContain('local');
  });
});
