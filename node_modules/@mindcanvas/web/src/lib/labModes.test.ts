// @vitest-environment jsdom
import { describe,expect,it,vi } from 'vitest';
import { buildLabPlanPrompt,cleanLab,labSandboxDocument } from './lab';
import { LAB_MODES,cleanLabThumbnail,cleanLabViewer } from './labModes';
import { readLabBridgeMessage,labBridgeScript } from './labPreview';
import { emptyLabEditor } from '../components/LabEditorDialog';
describe('Lab modes and preview isolation',()=>{
  it.each(LAB_MODES)('builds a distinct grounded prompt for %s',mode=>{const prompt=buildLabPlanPrompt({language:'vi',subject:'other',learnerLevel:'9',request:'learn',mode,sourceText:'reference'});expect(prompt).toContain(`MODE: ${mode}`);expect(prompt).toContain('untrusted reference data');expect(prompt).toContain('sandbox="allow-scripts"');expect(prompt).toContain('deterministic test plan');expect(prompt).toContain('data-lab-preview');});
  it('distinguishes animation speed from science and avoids invented psychology metrics',()=>{expect(buildLabPlanPrompt({language:'vi',subject:'chemistry',learnerLevel:'9',request:'electrolysis',mode:'animation'})).toContain('Distinguish animation speed');expect(buildLabPlanPrompt({language:'vi',subject:'other',learnerLevel:'',request:'consumer',mode:'scenario'})).toContain('Do not invent psychological probabilities');});
  it('cleans legacy metadata, oversized and script-bearing covers',()=>{const old=cleanLab({...emptyLabEditor(),mode:undefined,viewerConfig:{presentation:'bad'},thumbnail:'data:image/svg+xml;base64,PHN2Zz4='});expect(old?.mode).toBe('freeform');expect(old?.viewerConfig?.presentation).toBe('auto');expect(old?.thumbnail).toBeUndefined();expect(cleanLabThumbnail('data:image/png;base64,'+'a'.repeat(200000))).toBeUndefined();expect(cleanLabThumbnail('https://outside/image.png')).toBeUndefined();expect(cleanLabViewer({aspectRatio:'1:1',presentation:'scene'})).toEqual({aspectRatio:'1:1',presentation:'scene'});});
  it('accepts only the current iframe and session, bounds dimensions and validates covers',()=>{const source={} as Window;const data={channel:'mindcanvas-lab',token:'current',height:99999,thumbnail:'data:image/png;base64,YQ=='};expect(readLabBridgeMessage({source,data} as MessageEvent,source,'current')).toEqual({height:1200,thumbnail:data.thumbnail});expect(readLabBridgeMessage({source,data} as MessageEvent,{} as Window,'current')).toBeNull();expect(readLabBridgeMessage({source,data} as MessageEvent,source,'old')).toBeNull();expect(readLabBridgeMessage({source,data:{...data,height:NaN,thumbnail:'javascript:alert(1)'}} as MessageEvent,source,'current')).toEqual({height:undefined,thumbnail:undefined});});
  it('keeps preview transport behind CSP with no same-origin permission',()=>{const doc=labSandboxDocument('<canvas></canvas>',{bridgeToken:'session'});expect(doc).toContain('mindcanvas-lab');expect(doc).toContain("connect-src 'none'");expect(doc).not.toContain('allow-same-origin');expect(doc.indexOf('Content-Security-Policy')).toBeLessThan(doc.indexOf('window.parent'));});
  it('executes the emitted bridge and measures content instead of the iframe viewport',()=>{
    vi.useFakeTimers();
    const post=vi.spyOn(window,'postMessage').mockImplementation(()=>{});
    Object.defineProperty(document.body,'scrollHeight',{configurable:true,value:200});
    Object.defineProperty(document.documentElement,'scrollHeight',{configurable:true,value:560});
    try {
      const script=labBridgeScript('runtime-token').replace(/^<script>/,'').replace(/<\/script>$/,'');
      expect(()=>window.eval(script)).not.toThrow(); vi.advanceTimersByTime(150);
      expect(post).toHaveBeenCalledWith(expect.objectContaining({channel:'mindcanvas-lab',token:'runtime-token',height:216}),'*');
    } finally { post.mockRestore(); vi.useRealTimers(); }
  });

});
