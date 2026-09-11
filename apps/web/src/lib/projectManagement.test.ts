// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { blankBoard } from "./board";
const mocks = vi.hoisted(() => ({ session: vi.fn(), from: vi.fn() }));
vi.mock("./supabase", () => ({ getCurrentSession: mocks.session, supabase: { from: mocks.from } }));
import { cacheProject, readCache, updateProject, mergeProjects } from "./projectStore";
const record = () => { const board=blankBoard("Original"); return {id:board.id,title:board.title,folderId:null,updatedAt:board.updatedAt,board,pending:false}; };
beforeEach(()=>{localStorage.clear();vi.clearAllMocks();mocks.session.mockResolvedValue({user:{id:"owner"}});});
describe("Project metadata",()=>{
  it("trashes/restores locally without changing the board",async()=>{
    const p=record();cacheProject(null,p);
    await updateProject(null,p,{deletedAt:"2026-09-11T00:00:00Z",favorite:true});
    expect(readCache(null)[0].board).toEqual(p.board);expect(readCache(null)[0].favorite).toBe(true);
    await updateProject(null,p,{deletedAt:null});expect(readCache(null)[0].deletedAt).toBeNull();
  });
  it("cloud writes are owner-scoped and never overwrite content",async()=>{
    const p=record();cacheProject("owner",p);
    const chain:any={}; for(const name of ["update","eq","select","abortSignal"]) chain[name]=vi.fn(()=>chain); chain.single=vi.fn().mockResolvedValue({error:null}); mocks.from.mockReturnValue(chain);
    await updateProject("owner",p,{favorite:true});
    expect(chain.update).toHaveBeenCalledWith({is_favorite:true});expect(chain.eq).toHaveBeenCalledWith("user_id","owner");expect(chain.eq).toHaveBeenCalledWith("id",p.id);
    expect(readCache("owner")[0].favorite).toBe(true);
  });
  it("does not mutate cache on cloud failure or account mismatch",async()=>{
    const p=record();cacheProject("owner",p);
    mocks.session.mockResolvedValue({user:{id:"other"}});
    await expect(updateProject("owner",p,{deletedAt:"2026-09-11T00:00:00Z"})).rejects.toThrow();expect(mocks.from).not.toHaveBeenCalled();expect(readCache("owner")[0].deletedAt).toBeUndefined();
  });
  it("keeps the original cache when a cloud metadata update fails",async()=>{
    const p=record();cacheProject("owner",p);const chain:any={};for(const name of ["update","eq","select","abortSignal"])chain[name]=vi.fn(()=>chain);chain.single=vi.fn().mockResolvedValue({error:new Error("offline")});mocks.from.mockReturnValue(chain);
    await expect(updateProject("owner",p,{favorite:true})).rejects.toThrow("offline");expect(readCache("owner")[0].favorite).toBeUndefined();
  });
  it("remote trash and folder changes win over a clean cache at the same content timestamp",()=>{
    const p=record(), remote={...p,deletedAt:"2026-09-11T00:00:00Z",folderId:"new-folder",favorite:true};
    const merged=mergeProjects([remote],[p],"owner")[0];expect(merged.deletedAt).toBe(remote.deletedAt);expect(merged.folderId).toBe("new-folder");expect(merged.board).toBe(p.board);
  });
});
