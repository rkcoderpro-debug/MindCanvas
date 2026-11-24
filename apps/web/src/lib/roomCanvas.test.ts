import { expect, it } from "vitest";
import { blankBoard } from "./board";
import { meetingBoardCopy, mergeRoomBoard } from "./roomCanvas";
const text = (id: string, value = id) => ({ id,text:value,x:10,y:10,width:200 });

it("copies visible Canvas data without including source files or external content", () => {
  const original = { ...blankBoard("Workspace"), texts:[text("t")],
    embeds:[{ id:"private-link",kind:"web",url:"https://example.com" }], sourceDocuments:[{ id:"private",name:"name" }],
    layerOrder:["t","private-link"], background:{ kind:"image",src:"https://example.com/photo" } };
  const copy = meetingBoardCopy(original,"room");
  expect(copy).toMatchObject({ id:"room",title:"Workspace",media:[],embeds:[],background:"dots",layerOrder:["t"],texts:[text("t")] });
  expect(copy.sourceDocuments).toBeUndefined();
  expect(original.embeds).toHaveLength(1);
});

it("merges concurrent independent edits and detects edits to the same element", () => {
  const base = { ...meetingBoardCopy(blankBoard(),"room"),texts:[text("base")],layerOrder:["base"] };
  const mine = { ...base,texts:[...base.texts,text("one")],layerOrder:["base","one"] };
  const peer = { ...base,texts:[...base.texts,text("two")],layerOrder:["base","two"] };
  expect(mergeRoomBoard(base,mine,peer)).toMatchObject({ texts:[text("base"),text("two"),text("one")],layerOrder:["base","one","two"] });
  expect(mergeRoomBoard(base,{ ...base,texts:[text("base","mine")] },{ ...base,texts:[text("base","theirs")] })).toBeNull();
});
