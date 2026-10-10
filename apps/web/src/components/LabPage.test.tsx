// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LabPage from './LabPage';
import { readStoredLabs, saveStoredLab, writeLabDraft } from '../lib/labStorage';
import { emptyLabEditor } from './LabEditorDialog';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('../lib/learningShare', () => ({ canShare: () => false, deletePublishedLab: vi.fn(), listMyLearningCopySources: vi.fn(async () => []), listPublishedLabProjects: vi.fn(async () => []), publishLab: vi.fn(), publishedLabToLocal: vi.fn() }));
vi.mock('./LearningShareDialog', () => ({ LearningShareButton: () => <button>Chia sẻ</button> }));
const sample = { ...emptyLabEditor(), title: 'Điện phân', mode: 'animation' as const, programHtml: '<html><body><canvas></canvas><script>let step=0;</script></body></html>' };
const settle = async () => { for (let i=0;i<3;i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); }); };
let host: HTMLDivElement, root: Root;
async function render() { await act(async () => root.render(<LabPage owner={null}/>)); await settle(); }
async function click(text: string, scope: ParentNode = host) { const button = [...scope.querySelectorAll('button')].find(el => el.textContent?.trim() === text); expect(button, text).toBeTruthy(); await act(async () => button!.click()); await settle(); }
async function input(element: HTMLInputElement | HTMLTextAreaElement, value: string) { await act(async () => { Object.getOwnPropertyDescriptor(element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(element,value); element.dispatchEvent(new Event('input',{bubbles:true})); }); }
async function add() { await click('Thêm Lab'); }
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); localStorage.clear(); localStorage.setItem('mindcanvas:language','vi'); host=document.createElement('div'); document.body.append(host); root=createRoot(host); vi.spyOn(window,'confirm').mockReturnValue(true); HTMLDialogElement.prototype.showModal = function(){this.setAttribute('open','');}; HTMLDialogElement.prototype.close = function(){this.removeAttribute('open');}; });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });
describe('Lab library user workflows', () => {
  it('opens on a static gallery without starting Labs or showing the editor', async () => { await saveStoredLab(null,sample); await render(); expect(host.querySelectorAll('.lab-library-card')).toHaveLength(2); expect(host.querySelector('iframe')).toBeNull(); expect(host.querySelector('textarea')).toBeNull(); expect(host.querySelector('dialog')).toBeNull(); });
  it('shows HTML only on demand, saves an HTML-only Lab and opens it after reload', async () => {
    await render(); await add(); expect(host.querySelector('textarea')).toBeNull();
    await input(host.querySelector('.lab-editor input')!, 'My HTML'); await click('Dán / sửa HTML'); await input(host.querySelector('textarea[aria-label=HTML]')!,sample.programHtml); await click('Lưu Lab');
    expect(host.querySelector('dialog')).toBeNull(); const stored=(await readStoredLabs(null)).find(l=>l.title==='My HTML'); expect(stored?.programHtml).toBe(sample.programHtml);
    await act(async () => root.unmount()); root=createRoot(host); await render(); const open=host.querySelector<HTMLButtonElement>('button[aria-label="Mở Lab: My HTML"]')!; await act(async () => open.click()); expect(host.querySelector('iframe')?.getAttribute('sandbox')).toBe('allow-scripts'); expect(host.querySelector('textarea')).toBeNull();
  });
  it('cancels edits without changing the saved Lab', async () => {
    const saved=await saveStoredLab(null,sample); await render(); const menu=host.querySelector<HTMLDetailsElement>('.lab-library-card .lab-card-menu')!; menu.open=true; await click('Chỉnh sửa',menu); await input(host.querySelector('.lab-editor input')!,'Changed'); await click('Hủy'); expect((await readStoredLabs(null)).find(l=>l.id===saved.id)?.title).toBe(sample.title);
  });
  it('rejects unsafe HTML while preserving input in the editor', async () => {
    await render(); await add(); await input(host.querySelector('.lab-editor input')!,'Unsafe'); await click('Dán / sửa HTML'); const text=host.querySelector<HTMLTextAreaElement>('textarea[aria-label=HTML]')!; await input(text,'<script>window.parent.document.body</script>'); await click('Lưu Lab'); expect(host.querySelector('[role=alert]')?.textContent).toContain('không an toàn'); expect(text.value).toContain('window.parent'); expect((await readStoredLabs(null)).filter(l=>!l.systemDemo)).toHaveLength(0);
  });
  it('reports storage failure without closing the editor or discarding HTML', async () => {
    await render(); await add(); await input(host.querySelector('.lab-editor input')!,'Quota'); await click('Dán / sửa HTML'); await input(host.querySelector('textarea[aria-label=HTML]')!,sample.programHtml); vi.spyOn(indexedDB,'open').mockImplementation(()=>{throw new DOMException('Full','QuotaExceededError');}); await click('Lưu Lab'); expect(host.querySelector('dialog')).toBeTruthy(); expect(host.querySelector<HTMLTextAreaElement>('textarea[aria-label=HTML]')?.value).toBe(sample.programHtml); expect(host.querySelector('[role=alert]')?.textContent).toContain('đầy');
  });
  it('restores a pending draft without starting its HTML on the gallery', async () => {
    await writeLabDraft(null,{ editor:{...sample,id:''},pending:true }); await render(); expect(host.querySelector('iframe')).toBeNull(); await add(); await click('Khôi phục bản nháp'); expect(host.querySelector<HTMLInputElement>('.lab-editor input')?.value).toBe(sample.title); expect(host.querySelector<HTMLTextAreaElement>('textarea[aria-label=HTML]')?.value).toBe(sample.programHtml);
  });
  it('keeps requests when changing AI mode and builds a mode-specific prompt', async () => {
    await render(); await add(); await click('Tạo bằng AI'); await input(host.querySelector('.lab-ai-setup textarea')!,'Explain electrolysis'); const choice=[...host.querySelectorAll<HTMLButtonElement>('.lab-mode-option')].find(b=>b.textContent?.includes('Trực quan kiến thức'))!; await act(async()=>choice.click()); expect(host.querySelector<HTMLTextAreaElement>('.lab-ai-setup textarea')?.value).toBe('Explain electrolysis'); await click('Tạo prompt HTML'); expect(host.querySelector<HTMLTextAreaElement>('textarea[aria-label=Prompt]')?.value).toContain('MODE: explainer');
  });
  it('requires explicit CDN consent and preserves the iframe across fullscreen changes', async () => {
    await saveStoredLab(null,{...sample,allowExternalResources:true,programHtml:'<html><body><script src="https://unpkg.com/react"></script></body></html>'}); await render(); await act(async()=>host.querySelector<HTMLButtonElement>('button[aria-label="Mở Lab: Điện phân"]')!.click()); expect(host.querySelector('iframe')).toBeNull(); await click('Cho phép tải thư viện và chạy'); const frame=host.querySelector('iframe'); expect(frame).toBeTruthy(); const fs=host.querySelector<HTMLButtonElement>('button[aria-label="Toàn màn hình"]')!; await act(async()=>fs.click()); expect(host.querySelector('iframe')).toBe(frame); await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))); expect(host.querySelector('iframe')).toBe(frame); await click('Thư viện Lab'); expect(host.querySelector('iframe')).toBeNull();
  });
  it('renders fifty Labs as static cards and filters by mode', async () => {
    for(let i=0;i<50;i++) await saveStoredLab(null,{...sample,title:`Lab ${i}`,mode:i%2?'algorithm':'animation'}); await render(); expect(host.querySelectorAll('.lab-library-card')).toHaveLength(51); expect(host.querySelector('iframe')).toBeNull(); const select=host.querySelector<HTMLSelectElement>('select[aria-label="Lọc chế độ"]')!; await act(async()=>{select.value='algorithm';select.dispatchEvent(new Event('change',{bubbles:true}));}); expect(host.querySelectorAll('.lab-library-card')).toHaveLength(25);
  });
});
